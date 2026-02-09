# Fortunato Web

Standalone storefront for Fortunato. Built with Astro and a performance‑first, minimal UI.

## Stack
- Astro 5
- Vanilla CSS
- JSON data source

## Scripts
```bash
npm install
npm run dev
npm run build
npm run preview
```

## Project Structure
```
.
├─ data/
│  └─ products.json      # Single source of truth for catalog
├─ public/
│  └─ placeholder.svg    # Placeholder image
├─ src/
│  ├─ components/
│  ├─ layouts/
│  ├─ pages/
│  └─ styles/
├─ SPEC.md               # Product/site brief
└─ DECISIONS.md          # Assumptions & placeholders
```

## Content & Catalog
Edit `data/products.json` to update products, prices, materials, and images.

## Pages
- `/` Home
- `/product/[slug]` Product detail
- `/cart` Cart
- `/checkout` Checkout stub (Tienda Nube / WhatsApp)

## Notes
- Images are placeholders until real assets are added.
- Checkout is intentionally minimal for validation speed.

## License
All rights reserved.
