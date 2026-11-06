import { useEffect, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { assetBlob } from '../lib/api';

export function AssetImage({
  path,
  linked = false,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { path?: string | null; linked?: boolean }) {
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);
  const protectedPath = path?.startsWith('/api/assets/');
  useEffect(() => {
    if (!protectedPath || !path) return;
    const controller = new AbortController();
    let objectUrl = '';
    setSource('');
    setFailed(false);
    void assetBlob(path, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, protectedPath]);
  const url = protectedPath ? source : path || '';
  if (!url)
    return <span className="fine-print">{failed ? 'Image unavailable' : 'Loading image…'}</span>;
  const image = <img {...props} src={url} alt={props.alt || ''} />;
  return linked ? (
    <a href={url} target="_blank" rel="noreferrer">
      {image}
    </a>
  ) : (
    image
  );
}
