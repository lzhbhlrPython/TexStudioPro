import { themeTexArtwork } from '../lib/texArtwork';

export function TexArtwork({ src, alt }: { src: string; alt: string }) {
  return <span key={src} className="tex-artwork" data-artwork="document-color"><img crossOrigin="anonymous" src={src} alt={alt} onLoad={e => themeTexArtwork(e.currentTarget.parentElement!, e.currentTarget)} /></span>;
}
