import type { SupabaseClient } from "@supabase/supabase-js";

const MAX = 1200;

// Redimensiona para no máx. 1200px, converte para webp e sobe em fotos/{empresa_id}/.
export async function enviarFoto(supabase: SupabaseClient, empresaId: string, arquivo: File) {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, MAX / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);

  const gerar = (tipo: string) =>
    new Promise<Blob | null>((r) => canvas.toBlob(r, tipo, 0.8));
  let blob = await gerar("image/webp");
  // Safari não codifica webp no canvas (devolve png): cai para jpeg.
  if (blob?.type !== "image/webp") blob = await gerar("image/jpeg");
  if (!blob) throw new Error("Não foi possível processar a imagem");

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const caminho = `${empresaId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("fotos")
    .upload(caminho, blob, { contentType: blob.type });
  if (error) throw error;
  return supabase.storage.from("fotos").getPublicUrl(caminho).data.publicUrl;
}
