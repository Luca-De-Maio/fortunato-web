export type SocialPostTone = "feature" | "standard" | "tall";

export interface SocialPost {
  id: string;
  title: string;
  caption: string;
  image: string;
  alt: string;
  tone: SocialPostTone;
}

// Curated locally so the layout stays premium even before wiring a live IG feed.
export const socialFeed: SocialPost[] = [
  {
    id: "riviera-night",
    title: "Riviera",
    caption: "Camisa abierta, aire limpio, noche larga.",
    image: "/images/products/camisa-riviera/camisa-riviera-look-negro.webp",
    alt: "Look editorial con camisa Riviera en tonos oscuros",
    tone: "feature"
  },
  {
    id: "doppio-collo",
    title: "Doppio Collo",
    caption: "Algodon preciso para dias de verano sereno.",
    image: "/images/products/remera-doppio-collo/mesa-de-trabajo-205-copia-11-hero.webp",
    alt: "Remera Doppio Collo en clave editorial",
    tone: "standard"
  },
  {
    id: "sprezzata",
    title: "Sprezzata",
    caption: "Pique liviano, gesto relajado, presencia limpia.",
    image: "/images/products/chomba-sprezzata/img-8775-hero.webp",
    alt: "Chomba Sprezzata fotografiada en estudio",
    tone: "tall"
  },
  {
    id: "rilassata",
    title: "Rilassata",
    caption: "Sastreria corta para dias que piden soltura.",
    image: "/images/products/bermuda-rilassata/img-9031-hero.webp",
    alt: "Bermuda Rilassata en look editorial",
    tone: "standard"
  }
];
