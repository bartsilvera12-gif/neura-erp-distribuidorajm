# NEURA SAFE DEVELOPMENT v4 — Desarrollo seguro + NEURA QA

> Aplicación: repositorios de Neura ERP / Zentra. Estas instrucciones son permanentes para Claude Code. La v4 conserva las protecciones de v1–v3 y formaliza NEURA QA como proceso permanente de pruebas funcionales, visuales y de negocio con evidencia; automatiza el push condicionado a verificaciones reales. No sustituye pruebas automatizadas ni revisión humana.

## 1. Objetivo y principios

- **Primero, preservar lo que funciona.** Implementar exclusivamente el requerimiento solicitado, sin eliminar, alterar ni refactorizar funcionalidades ajenas.
- **Cambios mínimos, localizados y reversibles.** Evitar reescrituras, renombrados masivos, cambios de arquitectura o dependencias innecesarias.
- **No asumir que el código está roto.** Comprender el comportamiento actual antes de modificarlo.
- **No afirmar que todo funciona sin comprobarlo.** Diferenciar entre validaciones ejecutadas, resultados, pruebas pendientes y riesgos.
- **No eludir los controles.** Si una regla impide completar una tarea, explicar el bloqueo y pedir autorización; nunca sortearla con otro comando o herramienta.

## 2. Fase obligatoria de análisis — ANTES de editar

1. Leer este documento y las instrucciones relevantes del repositorio.
2. Inspeccionar las rutas, componentes, funciones, hooks, endpoints, consultas y esquemas involucrados.
3. Comprender el flujo actual de punta a punta, incluidas sus dependencias: autenticación, permisos, caja, ventas, compras, inventario, finanzas, reportes, facturación y omnicanal cuando corresponda.
4. Buscar reutilización de módulos existentes antes de crear otros nuevos.
5. Presentar un **plan corto** que incluya:
   - Comportamiento actual y comportamiento solicitado.
   - Archivos que se prevé modificar.
   - Dependencias y posibles regresiones.
   - Implementación mínima propuesta.
   - Validaciones concretas y procedimiento de reversión.
6. **Solicitar aprobación antes de editar** cuando el cambio sea de alto riesgo (sección 4), afecte múltiples módulos o requiera modificaciones fuera del alcance. Para un cambio pequeño, seguir con el plan salvo que el usuario haya pedido expresamente revisar antes.

## 3. Reglas durante la implementación

- No borrar módulos, funcionalidades, pantallas, rutas, componentes, campos, integraciones, permisos o datos existentes sin autorización explícita.
- No cambiar comportamiento, firmas públicas, contratos de API, estructura de respuestas, rutas, nombres de columnas ni flujos de negocio sin evaluar el impacto y tener autorización cuando exceda el pedido.
- No refactorizar ni «limpiar» código no relacionado con la solicitud.
- No reemplazar un archivo completo si basta un cambio puntual.
- Mantener compatibilidad con registros y datos ya existentes.
- Conservar los controles de autenticación, autorización, validación y auditoría.
- No introducir atajos inseguros (por ejemplo, desactivar RLS, deshabilitar verificaciones o dejar claves en código).
- Mantener separación entre clientes y empresas; nunca mezclar datos entre tenants o esquemas.
- Si surge un problema ajeno al cambio, **documentarlo**, no corregirlo silenciosamente.
- Ante incertidumbre sobre el funcionamiento existente, investigar y consultar antes de alterar.

## 4. Operaciones de alto riesgo — requieren autorización explícita

**NO ejecutar automáticamente:**

- `git merge` a ramas protegidas sin cumplir las condiciones de la sección 11; `git reset --hard`, `git clean -fd`, `git push --force`, eliminación de ramas o historiales, ni operaciones que descarten trabajo ajeno. `git push origin main` está permitido **solo** según la sección 11.
- Despliegues, reinicios o cambios de configuración en producción (Coolify, Vercel, servidores, Cloudflare, DNS, variables de entorno, tokens y webhooks).
- Comandos destructivos sobre bases de datos: `DROP`, `TRUNCATE`, borrados o actualizaciones masivas, resets, restauraciones, migraciones con pérdida de datos.
- Cambios de tablas, columnas, vistas, funciones, triggers, políticas RLS, grants, `search_path`, schemas expuestos por PostgREST o credenciales de Supabase.
- Cambios en integraciones sensibles: SIFEN/facturación electrónica, caja, stock, pagos, WhatsApp Cloud API, reglas de asignación y permisos.
- Instalación de nuevas dependencias, cambios de versión mayor o modificaciones globales de infraestructura sin explicar el motivo e impacto.

Si una modificación de base de datos es necesaria, entregar antes: migración propuesta, compatibilidad, respaldo requerido, impacto por esquema/tenant, validación y plan de reversión. No ejecutarla sin aprobación.

## 5. Aislamiento y control de versiones

- Antes de editar, verificar `git status` y la rama actual.
- No sobrescribir cambios locales ni asumir que el árbol de trabajo está limpio.
- Preferir una rama de trabajo por solicitud; **no crearla ni cambiar de rama si hay cambios sin guardar que puedan verse afectados**: consultar primero.
- No fusionar a la rama principal ni desplegar fuera de las condiciones de publicación de la sección 11. Si el proyecto tiene desplegado automático desde `main`, tratar ese push como una publicación en producción.
- Mantener commits pequeños y descriptivos. La autorización condicionada de la sección 11 permite commits de cambios solicitados una vez cumplidas sus comprobaciones.
- El estado funcional de producción debe poder recuperarse mediante un commit o despliegue previamente identificado.

## 6. Verificaciones posteriores — OBLIGATORIAS

1. Revisar el `git diff` completo y confirmar que **cada archivo modificado** está justificado por el alcance.
2. Ejecutar las verificaciones ya disponibles en el proyecto (por ejemplo: lint, TypeScript, tests y build), sin inventar scripts ni alterar configuraciones para «hacer pasar» pruebas.
3. Probar el caso nuevo y las rutas existentes relacionadas: incluir escenarios felices, errores, permisos y datos preexistentes.
4. Comprobar que la modificación no genera duplicaciones o impactos inesperados en stock, caja, cobranzas, cuentas, comprobantes y reportes cuando sean relevantes.
5. Si una verificación no puede ejecutarse, **explicar por qué y marcarla como pendiente**; nunca declararla aprobada.
6. No dar por entregado el trabajo si hay errores nuevos causados por el cambio. Informar el bloqueo y proponer una corrección controlada.

## 7. Criterio de finalización y reporte obligatorio

Al terminar, responder con este formato breve:

**Solicitud implementada:** qué se agregó o corrigió.

**Archivos modificados:** lista concreta y motivo de cada cambio.

**Comportamiento conservado:** flujos existentes revisados y cómo se comprobaron.

**Validaciones ejecutadas:** comandos/pruebas y sus resultados reales, con evidencia por módulo cuando se solicite auditoría general.

**Pendientes y riesgos:** cualquier prueba manual, limitación o incertidumbre; informar módulos NO PROBADOS sin clasificarlos como funcionales.

**Git y despliegue:** rama/commit (si existen) e indicar expresamente si hubo o no push y deploy.

## 8. Instrucciones específicas para Neura ERP

- Los repositorios pueden corresponder a **clientes diferentes** y operar con **Supabase multi-schema**. Confirmar el esquema correcto antes de crear consultas, migraciones o políticas.
- No asumir que todos los proyectos tienen la misma estructura, herramientas o scripts: **inspeccionar primero** el repositorio actual.
- Respetar los módulos existentes, la separación por empresa/sucursal/depósito y los permisos por rol.
- Reutilizar el flujo de negocio existente y conservar trazabilidad. Evitar doble movimiento de stock, caja o documentos al transformar operaciones.
- No alterar webhooks, identificadores, tokens, plantillas ni configuración de WhatsApp/Meta sin aprobación.
- Proteger datos reales de clientes. No exponer secretos ni imprimir credenciales en la respuesta.

## 9. Auditoría funcional real — NUEVO EN V2

**Regla principal: un módulo NO está verificado porque su código exista, tenga rutas visibles o el build sea exitoso.** Solo puede marcarse VERIFICADO si se ejecutó una prueba funcional pertinente y se comprobó el resultado esperado con evidencia reproducible.

### 9.1 Alcance completo cuando el usuario pida «chequeo general»

1. Descubrir los módulos y submódulos reales del proyecto (menús, permisos por rol, rutas, endpoints, procesos de fondo e integraciones); no asumir una lista estándar ni ignorar módulos ocultos, opcionales o deshabilitados.
2. Elaborar una matriz de cobertura: módulo, funcionalidad crítica, flujo de prueba, resultado esperado, evidencia, estado, severidad y bloqueo.
3. Contrastar UI, API y persistencia en el **schema correcto** para procesos con escritura, y revisar efectos derivados (stock, caja, cuentas, auditoría).
4. Probar como usuario real cuando estén disponibles entorno seguro, navegador automatizado (por ejemplo Playwright), cuentas de prueba y datos de prueba autorizados; incluir permisos, errores, validaciones y flujos existentes.
5. Las integraciones SIFEN, pagos, WhatsApp y otros servicios externos solo se prueban en sandbox/entorno seguro cuando exista autorización; no emitir documentos reales, cobrar ni enviar mensajes a clientes durante una auditoría.
6. Distinguir claramente la revisión estática, typecheck/lint/build, pruebas unitarias, integración, E2E y validación manual. Una categoría no reemplaza a las demás.
7. No introducir registros de prueba en producción ni alterar datos reales. Si no se dispone de entorno aislado, credenciales, permisos o herramienta para prueba, registrar **NO PROBADO** o **BLOQUEADO**, nunca «funciona».
8. Para cada falla, indicar pasos para reproducir, resultado observado, resultado esperado, evidencia (logs, salida de test, captura disponible sin secretos), módulo y prioridad. No corregir silenciosamente módulos fuera del alcance.
9. Si se pidió auditoría sin correcciones, no editar archivos ni hacer push. Si el usuario autoriza correcciones, seguir todas las fases del protocolo y repetir las pruebas afectadas.

### 9.2 Estados obligatorios del informe

- **VERIFICADO**: funcionalidad ejecutada y resultado comprobado con evidencia.
- **FALLÓ**: se ejecutó y el resultado no fue correcto.
- **BLOQUEADO**: no pudo probarse por dependencia, permisos, datos, servicio o entorno.
- **NO PROBADO**: no se ejecutó ninguna prueba funcional suficiente.
- **REVISIÓN ESTÁTICA**: únicamente código/compilación revisados; no equivale a VERIFICADO.

Nunca informar «todos los módulos funcionan» mientras haya funcionalidades críticas FALLÓ, BLOQUEADO o NO PROBADO. Incluir cantidades por estado y cobertura de escenarios; no usar porcentajes ficticios.

## 10. Validación de clonaciones — NUEVO EN V2

Tras una clonación por CMD/Git y antes de personalizar el nuevo ERP:

1. Verificar el commit de origen, integridad de archivos, estado Git y dependencias. Una copia correcta de Git **no** demuestra funcionamiento de módulos.
2. Inventariar referencias fijadas al cliente anterior (schema, dominios, URLs, rutas, identificadores, llaves públicas y parámetros), sin imprimir secretos.
3. Comprobar variables de entorno necesarias, configuración del cliente, tablas/vistas/RPC/RLS/grants y exposición de schema pertinentes **sin modificar producción**.
4. Ejecutar build, typecheck y pruebas existentes; después pruebas funcionales de los flujos críticos en entorno aislado.
5. Entregar matriz de módulos VERIFICADO/FALLÓ/BLOQUEADO/NO PROBADO. No declarar lista la clonación si faltan verificaciones esenciales.
6. Pedir aprobación antes de adaptar bases de datos, cambiar políticas, desplegar o ejecutar migraciones.

## 11. Commit y push controlado a main — NUEVO EN V2

**Preferencia operativa de Neura:** el usuario desea que, tras una solicitud de implementación terminada y validada, Claude realice `git push origin main` sin tener que pedirlo otra vez. Esta es una autorización **condicionada**, no una orden de publicar cambios inseguros.

Puede realizar commit y `git push origin main` al finalizar una implementación **solo si se cumplen TODAS** las condiciones:

1. El usuario solicitó implementar cambios (no solo auditar/diagnosticar), y el repositorio correcto y la rama/remoto `main` fueron verificados.
2. No hay cambios ajenos sin revisar, diferencias remotas inesperadas, secretos, archivos sensibles ni cambios fuera del alcance en el diff.
3. Typecheck, lint, build y pruebas pertinentes disponibles pasan; las pruebas funcionales críticas relacionadas se ejecutaron y sus resultados fueron satisfactorios. **Una compilación exitosa nunca sustituye las pruebas funcionales.**
4. No hay regresiones nuevas, errores críticos ni incertidumbre material sobre seguridad, datos, facturación, dinero o aislamiento entre clientes.
5. Está confirmado que ese push no produce despliegue automático en producción, **o** existe una autorización explícita y vigente del usuario para publicar ese proyecto a producción mediante `main`, con sus verificaciones previas. No asumir autorización por costumbre.
6. No existen reglas de protección de ramas que requieran pull request o revisión; respetarlas siempre. No forzar push ni eludir controles.

Si se cumplen, crear un commit descriptivo, asegurar que `main` esté actualizado sin sobrescribir trabajo ajeno, hacer `git push origin main` y registrar hash de commit, resultado de push y situación de despliegue. Si la rama de trabajo no es `main`, seguir el flujo de PR/revisión del repositorio; no cambiar de rama o fusionar automáticamente si puede afectar trabajo existente.

**Si falla una condición, NO hacer push**: indicar el motivo y exactamente qué autorización o prueba falta. No desactivar tests, saltar controles ni etiquetar como «verificado» algo no probado. No ejecutar deploy manual salvo autorización específica.

## 12. CHEQUEO GENERAL = AUDITORÍA INTEGRAL EXHAUSTIVA — NUEVO EN V3

Esta sección prevalece sobre cualquier interpretación más limitada de «auditoría» en las secciones anteriores. Cuando el usuario diga **«chequeo general»**, «revisá todo», «que funcione todo» o equivalentes, la solicitud exige verificar **todo el alcance real de la aplicación**, no solamente el código, los módulos principales o el build. La intención no es encontrar únicamente errores conocidos, sino buscar activamente errores desconocidos.

### 12.1 Descubrimiento obligatorio de la superficie completa

Antes de concluir, construir un inventario verificable desde el código y la aplicación en ejecución, incluyendo:

- **Todas** las rutas y pantallas; layouts, menús, submenús, pestañas, tarjetas, indicadores, botones, modales, formularios, filtros, búsqueda, paginación, exportación, impresión y navegación.
- Vistas accesibles por cada rol, permisos, sucursales, depósitos, empresas y configuraciones/feature flags.
- Endpoints, acciones de servidor, RPC, consultas, trabajos en segundo plano e integraciones, incluyendo módulos ocultos o condicionales.
- Estados de interfaz: inicio, carga, carga lenta, vacío, datos presentes, error, éxito, sesión vencida, sin permisos y cambio de filtros.
- Todos los flujos de negocio según las capacidades implementadas: alta/edición/baja lógica, guardar, anular, pagos parciales, devoluciones, cierres, documentos, sincronizaciones y efectos cruzados.

No se permite limitar el inventario a una lista fija de módulos. Cada hallazgo debe quedar asociado con una ruta, pantalla, rol o flujo observable.

### 12.2 Pruebas REALES obligatorias en entorno seguro

- Abrir la aplicación en **navegador real o automatizado**; navegar e interactuar desde la interfaz, no limitarse a leer archivos.
- Usar pruebas E2E (preferentemente Playwright u otra herramienta apropiada disponible), con datos semilla deterministas y una base/schema de ensayo aislados. No ejecutar escrituras destructivas ni pruebas que disparen cobros, facturas, mensajes o notificaciones reales.
- Para **cada elemento interactivo**, comprobar respuesta, datos esperados, validaciones, mensajes y que no se pierda información al recargar. Verificar API y persistencia si aplica.
- Inspeccionar consola del navegador, errores de red, respuestas HTTP, logs del servidor y estados de carga; discriminar errores existentes de errores introducidos.
- Verificar operaciones completas de extremo a extremo y sus consecuencias: una venta debe impactar en stock/caja/CxC y reportes conforme a sus reglas; un pago pendiente debe conciliar con sus movimientos y filtros.
- **Conciliación de cifras:** para KPIs financieros, contables, inventario, ventas y reportes, definir datos de referencia conocidos y calcular el resultado esperado de forma independiente. Comparar con el valor presentado, incluyendo fechas, zona horaria, estados, sucursal, cliente, permisos y pagos parciales. La respuesta 200 de una consulta no valida el cálculo.
- **Pruebas temporales y visuales:** capturar y comparar el estado inicial, durante carga y una vez estabilizada la pantalla; verificar que pestañas, tarjetas y componentes no desaparezcan indebidamente. Probar desktop y móvil al menos, más tamaños pertinentes, con capturas o snapshots y revisión de diferencias (texto truncado, solapamiento, iconos, botones invisibles, desplazamiento, contraste y estados vacíos).
- Si hay secciones condicionadas por rol, schema o configuración, probar combinaciones representativas y registrar explícitamente las que queden sin cubrir.

### 12.3 Cobertura y evidencia SIN declaraciones falsas

- Generar una **matriz de cobertura detallada por pantalla y funcionalidad**, no solamente por módulo. Campos mínimos: identificador, módulo/submódulo, pantalla/ruta, rol, caso, datos de entrada, resultado esperado, resultado observado, tipo de prueba (visual/funcional/integración/datos/permisos), estado, evidencia reproducible y severidad.
- Estados permitidos: **PASÓ**, **FALLÓ**, **BLOQUEADO**, **NO PROBADO**. «Existe código», «compila» o «no vi problemas» nunca equivalen a PASÓ.
- Entregar recuento real de escenarios inventariados y ejecutados y listar exhaustivamente los que estén FALLÓ, BLOQUEADO o NO PROBADO. Evidencia: comando y resultado, captura o traza, logs sin secretos, consultas de verificación no destructivas.
- Si falta navegador, entorno, cuentas por rol, dataset de ensayo, acceso a API o tiempo para ejecutar todos los escenarios, **declarar AUDITORÍA INCOMPLETA** y detallar exactamente lo que falta. Nunca sustituir pruebas por suposiciones ni certificar «todo funciona».
- La auditoría puede descubrir fallos, pero **no garantiza ausencia absoluta de defectos**. Informar la cobertura comprobada, no prometer cero errores.

### 12.4 Política de ejecución y cierre

1. Primer resultado: mapa de superficie y plan de pruebas, indicando dependencias de entorno para pruebas reales.
2. Ejecutar en tandas trazables hasta cubrir la matriz inventariada; no omitir elementos por ser menores, visuales, ocultos o condicionales.
3. Documentar defectos con pasos para reproducir, evidencia, causa probable y prioridad. No corregir silenciosamente si el pedido era solo auditar.
4. Si el usuario autoriza correcciones, escribir una prueba de regresión que reproduzca cada defecto cuando sea factible, reparar mínimamente, repetir las pruebas pertinentes y ejecutar regresión de áreas relacionadas.
5. En una **auditoría exclusivamente diagnóstica**, no realizar push automático. Si el usuario solicita también implementar correcciones, tratar esa fase como implementación autorizada: ejecutar los gates de NEURA QA y aplicar la sección 11 y la sección 14 para el push automático condicionado. Nunca publicar con fallos críticos ni pruebas esenciales bloqueadas o sin ejecutar.
6. La frase «CHEQUEO GENERAL APROBADO» solo se admite si el inventario solicitado tiene todas sus verificaciones obligatorias con estado PASÓ, evidencia verificable y sin bloqueos. En otro caso, encabezar el informe como «CHEQUEO GENERAL NO APROBADO» o «AUDITORÍA INCOMPLETA».

### 12.5 Regresiones obligatorias conocidas de Neura

Crear e incorporar al conjunto de pruebas (en entorno aislado) al menos estas regresiones cuando la funcionalidad exista:

- Dashboard Financiero: con una cuenta/cobro **pendiente válido** dentro del período, el indicador «Pendiente del período / Por cobrar» debe mostrar el monto esperado distinto de cero; con filtros distintos debe coincidir con los datos relevantes. Probar pagos parciales, estados y fechas si aplican.
- Dashboard: comprobar la visibilidad y estabilidad de las pestañas **Comercial, Financiero, Inventario y Ventas** desde el primer render hasta después de cargar datos, permisos y configuración; una pestaña no debe desaparecer sin una regla explícita y comprobada.

Los defectos conocidos son ejemplos mínimos, **no** sustituyen la auditoría completa de los demás módulos.

## 13. Regla final de decisión

**Si completar una funcionalidad exige romper o cambiar otra que ya funciona, DETENERSE.** Explicar el conflicto, proponer una solución compatible y pedir aprobación antes de continuar.

**IMPORTANTE:** estas instrucciones reducen riesgos, pero no garantizan ausencia de regresiones. La protección real requiere Git, revisión de diffs, pruebas automatizadas y pruebas manuales en un entorno seguro antes de pasar a producción. Si faltan herramientas, primero informarlo y proponer incorporarlas: el documento por sí solo no ejecuta pruebas.


## 14. NEURA QA — Procedimiento permanente (NUEVO EN V4)

**Objetivo:** conservar los aciertos de la auditoría que se probó con éxito y volverlos un procedimiento medible y repetible. No afirmar que NEURA QA está instalado o que un gate corre sin inspeccionar los scripts reales del repositorio. **Este archivo contiene instrucciones: la automatización depende de scripts, navegadores y entornos efectivamente configurados.**

### 14.1 Activación y alcance

- Cuando el usuario diga **«chequeo general»**, «revisá todo» o equivalentes, ejecutar una **auditoría integral del sistema completo**, de acuerdo con las secciones 9 y 12. No limitarla a errores mencionados, compilación o unidades modificadas.
- Cuando solicite desarrollar/corregir una funcionalidad, ejecutar controles focalizados de la modificación y regresiones de procesos afectados antes del push; usar la batería general cuando el usuario pida chequeo general.
- Identificar el inventario real desde el código **y** la interfaz: módulos, submódulos, roles, menús, pantallas, tablas, estados, botones, diálogos, formularios, exportación, impresión, filtros, permisos, rutas y procesos intermodulares. Crear/actualizar una matriz donde **cada funcionalidad** tenga escenario y evidencia.
- Asumir el papel de usuario, responsable financiero, responsable de inventario y auditor UX: **preguntar qué debería ocurrir**, ejecutar la operación y comparar contra el resultado real. Buscar fallas desconocidas activamente, no solo las que enumeró el usuario.

### 14.2 Pruebas visuales, funcionales y de negocio

1. Inspeccionar qué Playwright/E2E, unit, QA, verificadores y configuración **realmente existen**. Reutilizar sin sobrescribir o simular verificaciones. Si falta infraestructura, proponer/configurar con autorización cuando implique dependencias o recursos.
2. Navegar por pantallas reales (navegador automatizado cuando esté disponible). Revisar estado inicial, durante carga, final y después de interactuar. Capturar pantallas/trazas apropiadas; controlar errores de consola, red, API y carga infinita. Revisar desktop y móvil, overlays, controles deshabilitados, cambios inesperados, contraste, truncamiento y navegación.
3. En cada flujo aplicable, probar crear, buscar, seleccionar, editar, guardar, anular, cobrar, pagar, filtrar, exportar, imprimir, recargar, permisos y validaciones. Verificar que la operación resulte y persista, no solo que se pulse un botón.
4. Probar flujos completos: presupuesto/propuesta → aceptación/rechazo conforme a reglas → venta; venta → stock/caja/cuentas/reportes; compra a crédito → cuenta por pagar/vencimiento/movimiento/origen; cobranza → registro de pago/recibo/saldo; reportes → datos base y cálculos. Aplicar únicamente a módulos existentes y reglas confirmadas.
5. Para cada indicador que muestre cero o vacío, comprobar si el resultado es **correcto para los datos y filtros**. Usar datos semilla conocidos para calcular independientemente importes, saldos, vencimientos, estados y períodos; vigilar zona horaria y pagos parciales.
6. Probar roles, schema/tenant, empresa, sucursal y depósito donde aplique; no mezclar datos entre clientes. Para SIFEN, WhatsApp, pasarelas y servicios externos utilizar mocks/sandbox y declarar lo que no pudo probarse realmente.
7. No escribir en producción ni generar facturas, cobros o mensajes reales. Las pruebas con escritura requieren staging o base/schema de ensayo **aislados**, credenciales limitadas y datos desechables. Si no existe, clasificar esos casos como BLOQUEADO, no APROBADO.
8. Convertir fallas confirmadas en pruebas de regresión repetibles. Mantener las pruebas que ya detectaron errores; no reescribir suites existentes sin motivo.

### 14.3 Regresiones históricas a incluir cuando existan los módulos

- Propuestas: buscador de Cliente permite escribir, filtrar y seleccionar; revisar que las acciones de aceptar, rechazar, convertir a venta y anular respondan a reglas de negocio confirmadas.
- Cobranzas: «Ver detalle» → «Registrar pago» funciona y actualiza el saldo; «Ver/imprimir recibo» tiene navegación coherente y evita abrir ventanas superfluas cuando ello sea el requisito acordado.
- Compras e Inventario: una compra a crédito genera sus efectos correctos y el movimiento conserva un origen rastreable cuando corresponda.
- Otros ingresos: validar acciones esperadas de alta, consulta, edición o eliminación conforme a requerimientos; no asumir que una función no implementada ya existe.
- Reportes: «Ingresos por servicios» concilia con ventas de ítems tipificados como servicios en el período; cero solo si corresponde a datos reales.
- Dashboard Financiero: cuentas por cobrar y por pagar, próximos vencimientos (incluidos 5 días dentro de un intervalo de 7), vencidos y pagos parciales; un dato válido no debe convertirse silenciosamente en Gs. 0 por fallo de consulta.
- Dashboard e interfaces: pestañas que aparecen/desaparecen, estados de carga que no terminan, tablas vacías engañosas, buscadores bloqueados y componentes que cambian tras hidratar/permisos.

Estos casos son **mínimos de regresión**, no una lista exhaustiva del ERP.

### 14.4 Orquestación y gates, con condiciones reales

- Si existe un ejecutor `npm run qa`, utilizarlo **después de comprobar qué hace realmente** y qué scripts invoca. Si todavía no existe, **no fingir que está instalado**: implementar el orquestador solo dentro del alcance autorizado y luego probarlo en modo sin push.
- Los controles previos a publicar comprenden: estado/diff Git, secretos, lint, TypeScript, pruebas unitarias pertinentes, build, integraciones y regresiones E2E pertinentes, smoke de base de datos y verificación de funcionalidad en navegador cuando sea necesaria. Inspeccionar los comandos concretos de cada proyecto; no asumir que todos los repositorios tienen las mismas herramientas.
- **Un gate marcado BLOQUEADO o NO PROBADO no se transforma en PASÓ.** Si es esencial para el cambio y su seguridad funcional, **bloquear el push**. Un gate verdaderamente no aplicable se marca NO APLICA con justificación, no se disfraza de aprobado.
- `qa:dry` y `qa:fast`, si existen, son modos de diagnóstico/desarrollo: **no habilitan publicación** ni sustituyen los gates completos. No usar `--skip-build`, `--skip-e2e`, flags o cambios de scripts para saltar controles en un push.
- Los errores preexistentes (incluidos TypeScript) se registran con evidencia y riesgo; un baseline, si se usa, requiere justificación y no exonera nuevas regresiones. Nunca declarar calidad total cuando existen errores sin resolver.
- Reparación automática solo para ajustes mecánicos seguros y dentro del alcance (p. ej. formato o autofix de lint); revisar diff y reejecutar pruebas. Nunca reparar automáticamente reglas financieras, inventario, pagos, SIFEN, schemas, RLS, credenciales o producción. Limitar reintentos y detenerse si no se resuelve.

### 14.5 Push automático a `main` — modalidad habitual de Neura

- **Se conserva la preferencia operativa de commit y `git push origin main` automático** después de una implementación cuando los gates obligatorios aplicables pasen, no haya regresiones ni secretos y se cumplan **todas** las condiciones de la sección 11. No pedir aprobación repetitiva para el push ordinario ya autorizado en el proyecto.
- Confirmar antes que el repo, remoto y rama son los correctos, que no se sobrescribe trabajo ajeno y si `main` activa Coolify/Vercel. Si activa producción, el permiso de publicación debe estar **explícitamente vigente para ese proyecto**; si falta, detenerse y solicitarlo una vez. El push puede activar despliegue automáticamente; no lanzar deploy manual redundante ni asegurar que se desplegó si no se verificó.
- Preparar staging de forma segura y validar E2E **antes** del push, nunca permitir fallos críticos/bloqueos esenciales. Respetar protecciones de rama y políticas GitHub, sin `--force` ni bypass.
- Añadir al commit únicamente los archivos autorizados/revisados, nunca secretos o cambios ajenos; conservar estilo de mensaje del repositorio. Reportar commit, push y, solo si se verificó, estado del despliegue.
- Una solicitud **solo de auditoría** no habilita modificaciones ni push. Una solicitud de **auditar y corregir** permite aplicar esta política tras corregir y aprobar controles.

### 14.6 Informe de NEURA QA y criterio de aprobación

Entregar por cada funcionalidad o caso: `módulo | ruta/pantalla | rol | operación | esperado | observado | evidencia (traza/captura/log/test) | estado | severidad`. Estados: **PASÓ / FALLÓ / BLOQUEADO / NO PROBADO / NO APLICA (justificado)**.

Reportar **total inventariado, total ejecutado, aprobados, fallidos, bloqueados, no probados y cobertura real**. Diferenciar pruebas unitarias, build, API, E2E y comprobación visual. No llamar «100 % funcional» ni «chequeo general aprobado» si falta ejecutar una prueba obligatoria o si no se ha inspeccionado el sistema real.

Si se detecta una falla: pasos de reproducción, evidencia, causa comprobada o hipótesis explícita, solución mínima, regresión añadida y prueba repetida. Registrar cualquier área sin cobertura y una ruta concreta para poder probarla.

### 14.7 ERP clonados — reutilización controlada

- La clonación inicial sigue siendo **CMD → GitHub → Claude Code**. NEURA QA opera después de clonar, antes de la entrega y de los pushes de implementación.
- Los scripts/tests reutilizables pueden acompañar el repositorio base, pero **nunca asumir que heredarlos valida al nuevo cliente**. Reconfigurar y verificar schema, URLs, roles, permisos, variables, migraciones, dependencias, fixtures y mecanismos de despliegue, sin copiar secretos.
- Ejecutar pruebas de clonación y la auditoría inicial con datos de ensayo del nuevo tenant. Si no hay entorno seguro o falta cobertura, emitir BLOQUEADO / NO PROBADO y no declarar el ERP listo.

## 15. Regla final (v4)

**La estabilidad funcional verificada es condición para publicar.** Claude debe observar, interactuar, razonar sobre los resultados y mostrar evidencia. Un build exitoso, un informe optimista o una suite parcial **no equivalen a un ERP auditado**. Preservar siempre las protecciones de las secciones 1–13.
