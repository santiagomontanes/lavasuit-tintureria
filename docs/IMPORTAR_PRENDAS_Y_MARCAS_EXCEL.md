# Importar prendas y marcas desde Excel

LavaSuit acepta importación masiva de prendas y marcas desde un archivo `.xlsx`.
Endpoints expuestos en Desktop bajo el botón **"Importar Excel"** de las páginas
de **Prendas** y **Marcas**.

## Acceso

- Solo usuarios con rol **ADMIN**.
- Tamaño máximo del archivo: **10 MB** (prendas) y **5 MB** (marcas).
- Formato aceptado: `.xlsx` o `.xls`.

## Plantillas

Cada modal incluye un botón **"Descargar plantilla"** que entrega un archivo
preformateado. También se pueden descargar manualmente con auth:

- `GET /api/servicios/plantilla-excel`
- `GET /api/marcas/plantilla-excel`

---

## Prendas — Hoja `prendas`

Columnas esperadas (la primera fila debe ser los headers):

| Columna       | Obligatoria | Descripción                                                    |
|---------------|:-----------:|----------------------------------------------------------------|
| `codigo`      | No          | Identificador corto (cam, ph). Se usa para match al actualizar.|
| `nombre`      | Sí          | Nombre visible (Camisa, Pantalón Hombre).                      |
| `categoria`   | No          | Lavado, tintura, planchado, etc.                               |
| `precio_base` | Sí          | Número >= 0. Acepta coma o punto decimal.                       |
| `abreviaturas`| No          | Lista separada por coma (cam, c).                              |
| `activo`      | No          | `1/0`, `si/no`, `true/false`. Por defecto activo.              |

### Ejemplo

| codigo | nombre           | categoria | precio_base | abreviaturas | activo |
|:------:|:-----------------|:---------:|------------:|:-------------|:------:|
| cam    | Camisa           | lavado    | 8000        | cam,c        | 1      |
| ph     | Pantalón Hombre  | tintura   | 18000       | ph,p         | 1      |
| pd     | Pantalón Dama    | tintura   | 16000       | pd           | 1      |

### Comportamiento

- Si `codigo` está presente **y** existe una prenda no eliminada con ese código,
  se **actualiza** (UPDATE).
- Si `codigo` no existe o no hay match, se **crea** (CREATE) con `unidad = "prenda"`.
- Los pedidos históricos **no se ven afectados** (mantienen nombre y precio).

---

## Marcas — Hoja `marcas`

| Columna       | Obligatoria | Descripción                                |
|---------------|:-----------:|--------------------------------------------|
| `codigo`      | No          | Identificador corto (z, ni).               |
| `nombre`      | Sí          | Nombre visible (Zara, Nike).               |
| `abreviaturas`| No          | Lista separada por coma (z, za).           |
| `activo`      | No          | `1/0` por defecto activa.                  |

### Ejemplo

| codigo | nombre | abreviaturas | activo |
|:------:|:-------|:-------------|:------:|
| z      | Zara   | z,za         | 1      |
| ni     | Nike   | ni,nik       | 1      |

---

## Tolerancias del parser

- Si la hoja no se llama exactamente `prendas` o `marcas`, se usa la **primera
  hoja** del libro.
- Los headers se normalizan: minúsculas, sin acentos, espacios → `_`. Así
  `Precio Base` y `precio base` y `Precio_Base` valen lo mismo.
- Aliases automáticos: `precio` se acepta como `precio_base`.
- Filas vacías se omiten.

## Reporte

La respuesta es un JSON:

```json
{
  "total": 25,
  "creadas": 8,
  "actualizadas": 17,
  "errores": [{ "fila": 12, "error": "precio_base inválido" }]
}
```

Los errores **no abortan** la importación: cada fila se procesa
independientemente y se reportan los fallos.

## Sincronización con mobile

- Las prendas y marcas se descargan al hacer pull en mobile via el endpoint
  existente `/api/servicios` y `/api/marcas` (ya incluyen los nuevos campos).
- El SQLite mobile tiene las columnas y la tabla `marcas` listas (migración
  aditiva idempotente al iniciar la app).
- El autocomplete en mobile (a entregar en F2 — formulario POS) consumirá
  `/api/servicios/autocomplete?q=X` y `/api/marcas/autocomplete?q=X`.
