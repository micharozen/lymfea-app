export default function Settings() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚙️</span>
          <h1 className="text-3xl font-bold text-foreground">Paramètres & Accès</h1>
        </div>
      </div>

      <div className="max-w-4xl">
        <p className="text-muted-foreground">
          Page de paramètres et gestion des accès.
        </p>
      </div>
    </div>
  );
}
