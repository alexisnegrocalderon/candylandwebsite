import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { hideSplash } from "@/lib/splash";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: '' };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Antes esto no se registraba en ningún lado — un crash de render (ej.
    // "pantalla en blanco" reportada en móvil) quedaba sin rastro. Al menos
    // queda en la consola del navegador de quien lo sufre, para poder pedirle
    // que la revise si vuelve a pasar.
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack });
    // Que el splash de apertura nunca tape el mensaje de error.
    hideSplash({ intro: false });
  }

  render() {
    if (this.state.hasError) {
      const { error, componentStack } = this.state;
      const detail = [error ? `${error.name}: ${error.message}` : '', error?.stack?.split('\n').slice(0, 4).join('\n') ?? '', componentStack.split('\n').slice(0, 6).join('\n')].filter(Boolean).join('\n\n');
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-2 text-center">Algo salió mal en esta pantalla</h2>
            <p className="mb-4 text-center text-sm text-muted-foreground">Tus entradas y tu cuenta están a salvo. Vuelve a la pantalla anterior o al inicio.</p>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6 max-h-40">
              <pre className="text-xs text-muted-foreground whitespace-break-spaces">
                {detail}
              </pre>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign('/'); window.setTimeout(() => window.location.reload(), 150); }}>
                Volver
              </Button>
              <Button onClick={() => window.location.assign('/')}>
                Ir al inicio
              </Button>
              <Button variant="ghost" onClick={() => window.location.reload()}>
                <RotateCcw size={16} />
                Recargar
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
