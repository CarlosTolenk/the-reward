# LEIDSA Game Rules And Modeling Notes

Este documento resume las reglas operativas de `Loto`, `MAS` y `Supermas` para que el proyecto tenga una referencia estable al momento de:

- analizar históricos;
- generar sugerencias;
- diseñar scoring;
- hacer backtesting;
- separar correctamente los juegos y sus bonos.

## Contexto General

LEIDSA permite jugar tres variantes relacionadas:

1. `Loto`
2. `MAS`
3. `Supermas`

Las tres comparten una base de `6 números del 1 al 40`, pero `MAS` y `Supermas` agregan bolas bono con dominios distintos.

## Loto

- Se eligen `6 números` del `1 al 40`.
- Se gana premio acertando `3 o más` números.
- Acertar los `6` números gana el premio mayor.
- Hay `4` formas de ganar premio.
- Premio mayor mínimo garantizado: `RD$20 millones`.
- Precio por jugada: `RD$50`.

### Modelo Analítico

- Espacio base: `6 de 40`.
- No hay bonos.
- Para evaluación de tickets, la métrica primaria es el solapamiento de `0..6` aciertos sobre los `6` números base.
- Toda frecuencia, coocurrencia, recencia y scoring base debe operar sobre estos `6` números.

## MAS

- Se eligen `6 números` del `1 al 40`.
- Además se elige `1 bola Bono` del `1 al 12`.
- Se gana premio en efectivo desde `4` aciertos.
- Acertar `6 + 1` gana el premio mayor.
- Premio mayor mínimo garantizado: `RD$150 millones`.
- Precio adicional por jugada: `RD$50`.

### Modelo Analítico

- Espacio base: `6 de 40`.
- Bono `MAS`: `1 de 12`.
- El análisis debe separar:
  - comportamiento de los `6` números base;
  - comportamiento de la bola `MAS`.
- No se debe mezclar la bola `MAS` con los `6` números base al calcular:
  - frecuencias base;
  - pares base;
  - métricas de dispersión base.
- Para scoring completo del ticket, se pueden usar dos capas:
  - score base de los `6` números;
  - score independiente para la bola `MAS`.

## Supermas

- Se eligen `6 números` del `1 al 40`.
- Se elige `1 bola Bono MAS` del `1 al 12`.
- Se elige `1 segunda bola Bono SUPERMAS` del `1 al 15`.
- Se puede ganar acertando desde combinaciones pequeñas, incluso con las bolas bono.
- Acertar `6 números + ambas bolas Bono` permite ganar el premio mayor máximo.
- Acertar `6 números + bola Supermas` gana el premio mayor de `RD$250 millones`.
- Puede llegar a `RD$420 millones o más`.
- Precio adicional por jugada: `RD$100`.

### Modelo Analítico

- Espacio base: `6 de 40`.
- Bono `MAS`: `1 de 12`.
- Bono `SUPERMAS`: `1 de 15`.
- El análisis debe tratar por separado:
  - números base;
  - bola `MAS`;
  - bola `SUPERMAS`.
- No conviene mezclar todos esos valores en una sola distribución de frecuencia porque son dominios distintos y contaminan el score.

## Reglas De Modelado Para El Proyecto

### 1. Separación de componentes

Cada resultado debe poder interpretarse como:

- `base`: 6 números `1..40`
- `mas`: 1 número `1..12` opcional
- `superMas`: 1 número `1..15` opcional

### 2. Análisis por juego

No mezclar históricos de juegos distintos en una misma estadística si la consulta es predictiva o comparativa.

- `Loto` debe analizarse contra `Loto`.
- `MAS` debe analizarse contra `MAS`.
- `Supermas` debe analizarse contra `Supermas`.

### 3. Análisis por dominio

No mezclar en una misma frecuencia:

- números base `1..40`
- bono `MAS` `1..12`
- bono `SUPERMAS` `1..15`

Cada dominio requiere su propio análisis.

### 4. Scoring

Una arquitectura razonable de scoring es:

1. `score_base` para los 6 números.
2. `score_mas` para la bola `MAS` si aplica.
3. `score_supermas` para la bola `SUPERMAS` si aplica.
4. `score_total = combinación ponderada de los anteriores`.

### 5. Backtesting

El backtesting debe medir por separado:

- aciertos base `0..6`;
- acierto de `MAS`;
- acierto de `SUPERMAS`;
- combinaciones compuestas, por ejemplo:
  - `6`
  - `6 + MAS`
  - `6 + SUPERMAS`
  - `6 + MAS + SUPERMAS`

### 6. Predictibilidad

Estas reglas sirven para modelar correctamente el juego, pero no garantizan que exista señal predictiva fuerte en los sorteos. Cualquier mejora debe validarse con backtesting fuera de muestra.

## Mapeo Recomendado En Código

- `Loto`: `base` solamente.
- `MAS`: `base + mas`.
- `Supermas`: `base + mas + superMas`.

### Recomendación de tipos

```ts
type ParsedDraw = {
  game: "leidsa-loto" | "leidsa-mas" | "leidsa-supermas";
  date: Date;
  base: [number, number, number, number, number, number];
  mas?: number;
  superMas?: number;
};
```

## Fuente de reglas

Resumen basado en la descripción funcional provista por el usuario para los juegos oficiales de LEIDSA:

- `Loto`
- `MAS`
- `Supermas`
