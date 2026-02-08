# Fortunato Storefront — SPEC

## Objetivo
Crear un storefront standalone, ultra rápido y premium, para validar demanda y convertir visitas en ventas con una experiencia simple, elegante y mobile-first.

## Público objetivo
Hombres 27–40, nivel socioeconómico medio-alto/alto, profesionales y emprendedores que valoran calidad, elegancia atemporal y materiales nobles.

## Posicionamiento y tono
- Elegancia atemporal, lujo discreto, herencia italo-argentina.
- Copy sobrio, directo, sin exageración ni marketing inflado.
- Inspiración: old money, sastrería contemporánea, verano europeo.

## Identidad visual
- Paleta: verde botella + beige cálido + gris pizarra / marrón cálido.
- Tipografía: display clásica (serif elegante) + sans moderna para legibilidad.
- Estética: minimalista, con textura sutil y mucho aire.

## Secciones Home
1. Hero (promesa + CTA principal “Ver cápsula”)
2. Cápsula 7 productos (grid)
3. Beneficios (calidad, materiales, herencia, exclusividad accesible)
4. Story breve (misión + valores)
5. FAQ (envíos, cambios, medios de pago)
6. Footer (contacto, WhatsApp, redes)

## Navegación
- Home
- Cápsula
- Beneficios
- FAQ
- Contacto

## Páginas mínimas
- `/` Home
- `/product/[slug]` detalle de producto
- `/cart` carrito
- `/checkout` checkout (stub)

## Checkout
- Flujo inicial: CTA a checkout con opción de redirección a Tienda Nube o WhatsApp.
- Preparado para integrar Mercado Pago en una fase posterior.

## Performance & SEO
- Imágenes optimizadas y lazy-load
- CSS mínimo, sin librerías pesadas
- Meta title/description/OG
- Accesible (contraste, foco visible, labels)

## Fuente de datos
Todo editable desde `data/products.json`.
