"use client";

import { useEffect, useState } from "react";
import { CAMPO_INICIO, CAMPO_ISCA } from "@/lib/antiRobo";

/**
 * Os dois campos invisíveis dos formulários públicos (ver src/lib/antiRobo):
 * a isca que só robô preenche e a hora em que o formulário apareceu. Vai
 * dentro do <form>; quem preenche de verdade não percebe nada.
 */
export function CamposAntiRobo() {
  // A hora só existe no navegador: gravada depois de montar, para o HTML do
  // servidor e o do navegador baterem.
  const [inicio, setInicio] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInicio(String(Date.now()));
  }, []);

  return (
    <>
      {/* Fora da tela (e não display:none, que robô simples detecta); fora do
          teclado e dos leitores de tela, para ninguém cair nele. */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] size-px overflow-hidden opacity-0">
        <label>
          Não preencha este campo
          <input type="text" name={CAMPO_ISCA} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <input type="hidden" name={CAMPO_INICIO} value={inicio} readOnly />
    </>
  );
}
