import { LoaderCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';
export function Loading({ text = 'Connecting to your studio…' }: { text?: string }) {
  return (
    <div className="data-state loading-state" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>{text}</span>
    </div>
  );
}
export function Failure({ message, retry }: { message: string; retry?: () => void }) {
  const signInRequired = message === 'Sign in to continue.' || message === 'Please sign in again.';
  return (
    <div className="data-state" role="alert">
      <h3>{signInRequired ? 'Your session has ended.' : 'We couldn’t connect just yet.'}</h3>
      <p>{message}</p>
      {signInRequired && (
        <Button asChild variant="dark">
          <Link to={'/login?next=' + encodeURIComponent(location.pathname + location.search)}>
            Sign in
          </Link>
        </Button>
      )}
      {!signInRequired && retry && (
        <Button variant="outline" onClick={retry}>
          <RefreshCw size={16} />
          Try again
        </Button>
      )}
    </div>
  );
}
export function Empty({
  title,
  text,
  to,
  action,
}: {
  title: string;
  text: string;
  to?: string;
  action?: string;
}) {
  return (
    <div className="data-state empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
      {to && (
        <Button asChild variant="dark">
          <Link to={to}>
            {action || 'Get started'}
            <ArrowRight size={17} />
          </Link>
        </Button>
      )}
    </div>
  );
}
