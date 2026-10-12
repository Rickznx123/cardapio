// Imprime HTML num iframe oculto, um de cada vez. Com Chrome --kiosk-printing não abre diálogo.
let fila: Promise<void> = Promise.resolve();

export function imprimir(html: string) {
  fila = fila.then(
    () =>
      new Promise<void>((pronto) => {
        const f = document.createElement("iframe");
        // Sem allow-scripts: mesmo se algum texto escapar do escape, nada roda dentro do cupom.
        f.setAttribute("sandbox", "allow-same-origin allow-modals");
        f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
        f.onload = () => {
          f.contentWindow!.focus();
          f.contentWindow!.print(); // bloqueia até o diálogo fechar (ou retorna logo no kiosk)
          setTimeout(() => {
            f.remove();
            pronto();
          }, 500);
        };
        f.srcdoc = html;
        document.body.appendChild(f);
      }),
  );
  return fila;
}
