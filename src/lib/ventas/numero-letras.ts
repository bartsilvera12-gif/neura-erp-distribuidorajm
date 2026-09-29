/**
 * Un monto en letras, como va en un recibo: 7.750 → "SIETE MIL SETECIENTOS
 * CINCUENTA". Solo la parte entera: el guaraní no tiene centavos.
 */

const UNIDADES = [
  "",
  "UNO",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISÉIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
  "VEINTE",
  "VEINTIUNO",
  "VEINTIDÓS",
  "VEINTITRÉS",
  "VEINTICUATRO",
  "VEINTICINCO",
  "VEINTISÉIS",
  "VEINTISIETE",
  "VEINTIOCHO",
  "VEINTINUEVE",
];
const DECENAS = [
  "",
  "",
  "",
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA",
];
const CENTENAS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
];

/** 0–999. */
function hastaMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let resto = "";
  if (r < 30) resto = UNIDADES[r];
  else {
    const d = Math.floor(r / 10);
    const u = r % 10;
    resto = u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
  }
  return [CENTENAS[c], resto].filter(Boolean).join(" ");
}

/** "UNO" se apocopa delante de MIL / MILLÓN: "VEINTIÚN MIL", "UN MILLÓN". */
function apocope(t: string): string {
  return t.replace(/VEINTIUNO$/, "VEINTIÚN").replace(/UNO$/, "UN");
}

export function numeroALetras(valor: number): string {
  let n = Math.floor(Math.abs(Math.round(valor)));
  if (n === 0) return "CERO";

  const partes: string[] = [];
  const millones = Math.floor(n / 1_000_000);
  n %= 1_000_000;
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;

  if (millones > 0) {
    partes.push(
      millones === 1
        ? "UN MILLÓN"
        : `${apocope(numeroALetras(millones))} MILLONES`,
    );
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : `${apocope(hastaMil(miles))} MIL`);
  }
  if (resto > 0) partes.push(hastaMil(resto));
  return partes.join(" ");
}
