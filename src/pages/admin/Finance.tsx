import { DailyClosure } from "@/components/admin/finance/DailyClosure";

// Le seul métier livré sur cet écran est la clôture quotidienne. Le netting
// lieux et les paiements thérapeutes réintroduiront des onglets le jour où ils
// existeront vraiment ; d'ici là, la page n'est qu'un conteneur.
const Finance = () => (
  <div className="p-6 md:p-8">
    <DailyClosure />
  </div>
);

export default Finance;
