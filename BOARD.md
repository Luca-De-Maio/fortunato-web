# Fortunato Board

## En curso / cerrado en esta iteracion

| Ticket | Estado | Prioridad | Alcance |
| --- | --- | --- | --- |
| FT-01 | Done | P0 | Sacar la cotizacion efectiva del frontend y revalidar carrito desde backend. |
| FT-02 | Done | P0 | Generar checkout de Mercado Pago con `preference` server-side. |
| FT-03 | Done | P0 | Agregar stock por variante y reservas cortas para reducir sobreventa. |
| FT-04 | Done | P1 | Reordenar la home: hero/carrusel arriba, CTA claros y menos ruido visual. |
| FT-05 | Done | P1 | Mover la grilla completa de productos a una pagina dedicada `/capsula`. |
| FT-06 | Done | P1 | Exponer estados de stock en PDP, carrito y conjuntos. |
| FT-07 | Done | P1 | Agregar control de stock al admin de productos. |
| FT-08 | Done | P1 | Sumar analytics propios al admin para pageviews, permanencia, secciones y clicks. |

## Siguiente bloque recomendado

| Ticket | Estado | Prioridad | Alcance |
| --- | --- | --- | --- |
| FT-09 | Next | P1 | Conectar webhook de Mercado Pago para confirmar pagos sin depender del redirect del usuario. |
| FT-10 | Next | P1 | Persistir ordenes/ventas con auditoria, estado y datos de envio. |
| FT-11 | Next | P2 | Refinar compra de conjuntos para elegir variantes reales dentro del set. |

## Manual / negocio

| Ticket | Estado | Prioridad | Alcance |
| --- | --- | --- | --- |
| FT-12 | Pending | P1 | Cargar stock real por variante en admin para reemplazar placeholders iniciales. |
| FT-13 | Pending | P2 | Curar y estandarizar fotos finales por producto (hero, grid y detalle). |
| FT-14 | Pending | P2 | Ajustar copy comercial final y revisar textos largos heredados en fichas de producto. |

## Notas

- El checkout ya no depende del precio guardado en navegador.
- La reserva de stock se crea al abrir Mercado Pago y expira sola si no se confirma.
- El stock inicial necesita una carga real desde admin para pasar de staging a operacion fina.
