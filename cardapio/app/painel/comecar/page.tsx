"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, Plus, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "@/components/toast";
import { enviarFoto } from "@/lib/foto";
import { mascaraTelefone, numeroWhats } from "@/lib/telefone";
import type { Empresa } from "../configuracoes";
import { botao, botaoIcone, botaoSec, card, carregarSessao, FotoInput, input, rotulo, supabase, valor } from "../ui";

const PASSOS = ["Sua marca", "Cardápio", "Entrega", "Pronto"];

// Wizard de primeiros passos (cadastro self-service cai aqui). Toda etapa pode ser pulada.
export default function Comecar() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | null>();
  const [passo, setPasso] = useState(0);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarSessao().then((s) => (s ? setEmpresa(s.papel === "dono" ? s.empresa : null) : router.replace("/login")));
  }, [router]);

  if (empresa === undefined) return <p className="p-6">Carregando…</p>;
  if (empresa === null) return <p className="p-6">Só o dono da loja pode fazer a configuração inicial.</p>;

  // Roda a etapa, avança se der certo; erro vira toast e fica na etapa.
  async function concluir(acao: () => Promise<Partial<Empresa> | void>) {
    setSalvando(true);
    try {
      const campos = await acao();
      if (campos) setEmpresa((e) => e && { ...e, ...campos });
      setPasso((p) => p + 1);
      scrollTo(0, 0);
    } catch (e) {
      toast.erro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const props = { empresa, concluir, salvando, pular: () => setPasso((p) => p + 1) };
  return (
    <main className="mx-auto w-full max-w-xl space-y-4 p-4 md:p-8">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Vamos montar sua loja</h1>
          <Link href="/painel" className="text-sm font-medium text-neutral-500 hover:underline">Ir para o painel</Link>
        </div>
        <ol className="grid grid-cols-4 gap-2" aria-label="Etapas">
          {PASSOS.map((p, i) => (
            <li key={p} aria-current={i === passo ? "step" : undefined} className="space-y-1">
              <span className={`block h-1.5 rounded-full ${i <= passo ? "bg-rose-600" : "bg-neutral-200 dark:bg-neutral-800"}`} />
              <span className={`block text-xs ${i === passo ? "font-semibold" : "text-neutral-500"}`}>{i + 1}. {p}</span>
            </li>
          ))}
        </ol>
      </header>
      {passo === 0 && <Marca {...props} />}
      {passo === 1 && <Cardapio {...props} />}
      {passo === 2 && <Entrega {...props} />}
      {passo >= 3 && <Pronto empresa={empresa} />}
    </main>
  );
}

type Props = {
  empresa: Empresa; salvando: boolean; pular: () => void;
  concluir: (acao: () => Promise<Partial<Empresa> | void>) => void;
};

function Rodape({ salvando, pular }: { salvando: boolean; pular: () => void }) {
  return (
    <div className="flex gap-2">
      <button disabled={salvando} className={`${botao} flex-1`}>{salvando ? "Salvando…" : "Salvar e continuar"}</button>
      <button type="button" onClick={pular} className={botaoSec}>Pular</button>
    </div>
  );
}

function Marca({ empresa, concluir, salvando, pular }: Props) {
  const [whats, setWhats] = useState(mascaraTelefone((empresa.whatsapp ?? "").replace(/^55(?=\d{10,11}$)/, "")));
  return (
    <form className={`${card} space-y-4`} onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      concluir(async () => {
        const logo = f.get("logo") as File;
        const campos = {
          logo_url: logo.size ? await enviarFoto(supabase, empresa.id, logo) : empresa.logo_url,
          cor_primaria: String(f.get("cor")),
          whatsapp: numeroWhats(whats) ?? empresa.whatsapp,
        };
        const { error } = await supabase.from("empresas").update(campos).eq("id", empresa.id);
        if (error) throw error;
        return campos;
      });
    }}>
      <h2 className="text-lg font-semibold">Logo, cor e WhatsApp</h2>
      <FotoInput name="logo" atual={empresa.logo_url} titulo="Logo da loja (quadrado)" />
      <label className="flex items-center gap-3"><span className="text-sm font-medium">Cor da sua marca</span>
        <input name="cor" type="color" defaultValue={empresa.cor_primaria ?? "#E11D48"}
          className="h-11 w-16 cursor-pointer rounded-lg border border-neutral-300 dark:border-neutral-700" />
      </label>
      <label className="block"><span className={rotulo}>WhatsApp da loja (aparece no cardápio)</span>
        <input value={whats} onChange={(e) => setWhats(mascaraTelefone(e.target.value))} inputMode="tel" placeholder="(66) 99999-9999"
          className={input} />
      </label>
      <Rodape salvando={salvando} pular={pular} />
    </form>
  );
}

function Cardapio({ empresa, concluir, salvando, pular }: Props) {
  return (
    <form className={`${card} space-y-4`} onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      concluir(async () => {
        const itens = [0, 1, 2]
          .map((i) => ({ nome: String(f.get(`nome${i}`)).trim(), preco: valor(f.get(`preco${i}`)), foto: f.get(`foto${i}`) as File }))
          .filter((i) => i.nome);
        const nomeCat = String(f.get("categoria")).trim();
        if (!nomeCat || !itens.length) return; // nada preenchido: só avança
        const { data: cat, error } = await supabase.from("categorias")
          .insert({ empresa_id: empresa.id, nome: nomeCat }).select("id").single();
        if (error) throw error;
        const linhas = await Promise.all(itens.map(async (i, ordem) => ({
          empresa_id: empresa.id, categoria_id: cat.id, nome: i.nome, preco: i.preco, ordem,
          foto_url: i.foto.size ? await enviarFoto(supabase, empresa.id, i.foto) : null,
        })));
        const { error: erroItens } = await supabase.from("itens").insert(linhas);
        if (erroItens) throw erroItens;
        toast.ok(`${linhas.length} ${linhas.length === 1 ? "item adicionado" : "itens adicionados"}`);
      });
    }}>
      <h2 className="text-lg font-semibold">Primeiros itens do cardápio</h2>
      <p className="text-sm text-neutral-500">Comece com poucos; depois você completa no editor do cardápio.</p>
      <label className="block"><span className={rotulo}>Categoria</span>
        <input name="categoria" defaultValue="Lanches" className={input} />
      </label>
      {[0, 1, 2].map((i) => (
        <fieldset key={i} className="space-y-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <legend className="px-1 text-sm font-medium">Item {i + 1}</legend>
          <div className="flex gap-2">
            <input name={`nome${i}`} placeholder="Nome (ex.: X-Burguer)" aria-label={`Nome do item ${i + 1}`} className={input} />
            <input name={`preco${i}`} inputMode="decimal" placeholder="0,00" aria-label={`Preço do item ${i + 1}`}
              className={`${input} w-28 shrink-0`} />
          </div>
          <input name={`foto${i}`} type="file" accept="image/*" aria-label={`Foto do item ${i + 1} (opcional)`}
            className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:font-medium dark:file:bg-neutral-800" />
        </fieldset>
      ))}
      <Rodape salvando={salvando} pular={pular} />
    </form>
  );
}

function Entrega({ empresa, concluir, salvando, pular }: Props) {
  const [entrega, setEntrega] = useState(empresa.aceita_entrega);
  const [bairros, setBairros] = useState([{ nome: "", taxa: "" }]);
  const mudar = (i: number, campos: Partial<{ nome: string; taxa: string }>) =>
    setBairros((b) => b.map((x, j) => (j === i ? { ...x, ...campos } : x)));

  return (
    <form className={`${card} space-y-4`} onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      concluir(async () => {
        const campos = { aceita_retirada: f.get("retirada") === "on", aceita_entrega: entrega };
        if (!campos.aceita_retirada && !campos.aceita_entrega) throw new Error("Escolha retirada, entrega ou as duas");
        const { error } = await supabase.from("empresas").update(campos).eq("id", empresa.id);
        if (error) throw error;
        const linhas = entrega ? bairros.filter((b) => b.nome.trim()).map((b) => ({ empresa_id: empresa.id, nome: b.nome.trim(), taxa: valor(b.taxa) })) : [];
        if (linhas.length) {
          const { error: erroB } = await supabase.from("bairros").insert(linhas);
          if (erroB) throw new Error(erroB.code === "23505" ? "Algum desses bairros já está cadastrado" : erroB.message);
        }
        return campos;
      });
    }}>
      <h2 className="text-lg font-semibold">Como o cliente recebe</h2>
      <label className="flex items-center justify-between gap-3"><span className="font-medium">Retirada no local</span>
        <input name="retirada" type="checkbox" defaultChecked={empresa.aceita_retirada} className="size-5 accent-rose-600" />
      </label>
      <label className="flex items-center justify-between gap-3"><span className="font-medium">Entrega (delivery)</span>
        <input type="checkbox" checked={entrega} onChange={(e) => setEntrega(e.target.checked)} className="size-5 accent-rose-600" />
      </label>
      {entrega && (
        <div className="space-y-2">
          <p className="text-sm text-neutral-500">Bairros atendidos e a taxa de cada um.</p>
          {bairros.map((b, i) => (
            <div key={i} className="flex gap-2">
              <input value={b.nome} onChange={(e) => mudar(i, { nome: e.target.value })} placeholder="Bairro" aria-label={`Bairro ${i + 1}`}
                className={input} />
              <input value={b.taxa} onChange={(e) => mudar(i, { taxa: e.target.value })} inputMode="decimal" placeholder="Taxa"
                aria-label={`Taxa do bairro ${i + 1}`} className={`${input} w-24 shrink-0`} />
              <button type="button" onClick={() => setBairros((x) => x.filter((_, j) => j !== i))} aria-label={`Remover bairro ${i + 1}`}
                className={botaoIcone}><Trash2 className="size-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setBairros((x) => [...x, { nome: "", taxa: "" }])} className={botaoSec}>
            <Plus className="size-4" /> Bairro
          </button>
        </div>
      )}
      <Rodape salvando={salvando} pular={pular} />
    </form>
  );
}

function Pronto({ empresa }: { empresa: Empresa }) {
  const [url] = useState(() => `${location.origin}/${empresa.slug}`);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { width: 1024, margin: 2 }).then(setQr).catch(() => {});
  }, [url]);

  return (
    <section className={`${card} space-y-4 text-center`}>
      <h2 className="text-xl font-bold">Sua loja está no ar! 🎉</h2>
      <p className="text-neutral-600 dark:text-neutral-400">Compartilhe o link no WhatsApp e no Instagram, e imprima o QR para as mesas.</p>
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link do cardápio" className={`${input} text-center`} />
      {qr && <img src={qr} alt="QR Code do cardápio" className="mx-auto size-48 rounded-xl border border-neutral-200 bg-white p-2" />}
      <div className="flex flex-wrap justify-center gap-2">
        {qr && <a href={qr} download={`cardapio-${empresa.slug}.png`} className={botaoSec}><Download className="size-4" /> Baixar QR</a>}
        <a href={url} target="_blank" rel="noopener noreferrer" className={botao}><ExternalLink className="size-4" /> Ver meu cardápio</a>
      </div>
      <Link href="/painel" className="block text-sm font-medium text-rose-700 hover:underline dark:text-rose-400">Ir para o painel</Link>
    </section>
  );
}
