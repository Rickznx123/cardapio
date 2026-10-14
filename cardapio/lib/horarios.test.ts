// node --test lib/horarios.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { diaOperacional, erroHorarios, type Horarios, inicioDiaOperacional, textoDia } from "./horarios.ts";

const cuiaba = (s: string) => new Date(`${s}-04:00`);
// 2026-10-17 é sábado; 2026-10-18 domingo.
const h: Horarios = {
  sab: [{ abre: "18:30", fecha: "02:00" }],
  dom: [{ abre: "11:00", fecha: "14:00" }, { abre: "18:00", fecha: "23:00" }],
};

test("sobreposição de turnos", () => {
  assert.equal(erroHorarios(h), null);
  assert.equal(erroHorarios({ dom: [{ abre: "11:00", fecha: "15:00" }, { abre: "14:00", fecha: "23:00" }] }), "Domingo: turnos se sobrepõem");
  assert.equal(erroHorarios({ dom: [{ abre: "11:00", fecha: "14:00" }, { abre: "14:00", fecha: "23:00" }] }), null);
  // sábado até 03:00 invade domingo que abre 02:00 (virada da semana)
  assert.equal(erroHorarios({ sab: [{ abre: "18:00", fecha: "03:00" }], dom: [{ abre: "02:00", fecha: "05:00" }] }), "Sábado invade o turno de Domingo");
  assert.equal(erroHorarios({ sex: [{ abre: "18:00", fecha: "02:00" }], sab: [{ abre: "02:00", fecha: "04:00" }] }), null);
});

test("texto do dia", () => {
  assert.equal(textoDia(h.sab), "18:30 às 02:00");
  assert.equal(textoDia(h.dom), "11:00 às 14:00 e 18:00 às 23:00");
  assert.equal(textoDia([]), "Fechado");
});

test("dia operacional com virada às 05:00", () => {
  assert.equal(diaOperacional(cuiaba("2026-10-18T01:00"), "05:00"), "2026-10-17");
  assert.equal(diaOperacional(cuiaba("2026-10-18T05:00"), "05:00"), "2026-10-18");
  assert.equal(diaOperacional(cuiaba("2026-10-18T01:00"), "00:00"), "2026-10-18");
  assert.equal(inicioDiaOperacional("2026-10-17", "05:00").toISOString(), "2026-10-17T09:00:00.000Z");
  assert.equal(inicioDiaOperacional("2026-10-17", "00:00").toISOString(), "2026-10-17T04:00:00.000Z");
});
