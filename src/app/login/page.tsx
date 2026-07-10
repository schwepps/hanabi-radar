import { Button } from '@/components/ui/Button';
import { login } from './actions';

export const metadata = { title: 'Connexion — Hanabi Intelligence' };

// searchParams are a Promise in Next 16 — await them.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-surface-sunken p-4">
      <form
        action={login}
        className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        <div className="space-y-1">
          <h1 className="text-h2 text-ink">Hanabi Intelligence</h1>
          <p className="text-body-sm text-text-mid">
            Connectez-vous avec votre compte partenaire.
          </p>
        </div>

        {error != null && (
          <p role="alert" className="text-body-sm text-danger">
            Identifiants invalides. Veuillez réessayer.
          </p>
        )}

        <label className="block space-y-1">
          <span className="text-body-sm font-medium text-ink">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="h-11 w-full rounded-md border border-border bg-surface px-3 text-body-sm text-ink outline-none focus:border-brand"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-body-sm font-medium text-ink">
            Mot de passe
          </span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="h-11 w-full rounded-md border border-border bg-surface px-3 text-body-sm text-ink outline-none focus:border-brand"
          />
        </label>

        <Button type="submit" className="w-full">
          Se connecter
        </Button>
      </form>
    </main>
  );
}
