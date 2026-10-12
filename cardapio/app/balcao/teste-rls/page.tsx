import { notFound } from "next/navigation";
import { TesteRls } from "./teste";

// TEMPORÁRIO: apagar esta pasta depois de validar a migration 004.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TesteRls />;
}
