import { TelaErro } from "@/components/tela-erro";

export default function NaoEncontrado() {
  return (
    <TelaErro codigo="404" titulo="Página não encontrada"
      texto="O endereço pode ter sido digitado errado ou o cardápio mudou de link. Confira com o restaurante." />
  );
}
