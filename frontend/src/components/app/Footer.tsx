const productLinks = ['Dashboard', 'Analytics', 'Reporting', 'Review workflow'];
const resourceLinks = ['Documentation', 'API reference', 'Status', 'Changelog'];
const secondaryLinks = ['Privacy', 'Terms', 'Contact'];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-7xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground">SSIAR</div>
            <p className="text-sm leading-6 text-muted-foreground">
              Secure document ingestion, verification, and analytics for screening operations.
            </p>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground">Product</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {productLinks.map(link => (
                <li key={link}>
                  <a href="#" className="hover:text-foreground">{link}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground">Resources</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {resourceLinks.map(link => (
                <li key={link}>
                  <a href="#" className="hover:text-foreground">{link}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground">Documentation</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {secondaryLinks.map(link => (
                <li key={link}>
                  <a href="#" className="hover:text-foreground">{link}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-6 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>&copy; 2026 SSIAR. All rights reserved.</span>
          <span>Built for secure student screening operations.</span>
        </div>
      </div>
    </footer>
  );
}
