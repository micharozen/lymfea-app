import { Mail, Phone } from "lucide-react";

const Landing = () => {
  return (
    <div className="min-h-screen bg-[#f7f4ef] text-[#111111]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[rgba(247,244,239,0.96)] backdrop-blur-md border-b border-[#e2d7c7]">
        <div className="max-w-[1040px] mx-auto px-5">
          <nav className="flex items-center justify-between py-3.5 text-[13px]">
            <div className="tracking-[0.18em] uppercase">OOM PARIS</div>
            <div className="flex gap-4.5 items-center">
              <a href="#offers" className="hidden md:block text-[#111] opacity-70 hover:opacity-100 transition-opacity">
                Offres
              </a>
              <a href="#trunk" className="hidden md:block text-[#111] opacity-70 hover:opacity-100 transition-opacity">
                La malle
              </a>
              <a
                href="#contact"
                className="py-2 px-4.5 rounded-full border border-[#111] bg-white uppercase tracking-[0.14em] text-[11px] hover:bg-gray-50 transition-colors"
              >
                Organiser une journée
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main className="pb-10">
        {/* SECTION 1 – HERO */}
        <section className="py-12 md:py-12">
          <div className="max-w-[1040px] mx-auto px-5">
            <div className="grid md:grid-cols-[1.1fr_1.2fr] gap-8 items-center">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#7a746b] mb-2.5">
                  Bien être & beauté mobile
                </div>
                <h1 className="font-serif text-[34px] leading-[1.1] mb-3.5">
                  Le soin couture, livré dans vos espaces.
                </h1>
                <p className="text-[14px] text-[#7a746b] mb-5 max-w-[380px]">
                  Coiffure, barbier, soin visage et manucure. Des praticiens experts et une malle haute couture
                  qui transforment vos bureaux ou vos suites en espace de bien être.
                </p>
                <div className="flex flex-wrap gap-2.5 mb-3.5">
                  <a
                    href="#contact"
                    className="rounded-full py-2.75 px-5.5 text-[11px] uppercase tracking-[0.14em] bg-[#111] text-white border border-[#111] hover:bg-[#222] transition-colors inline-flex items-center justify-center"
                  >
                    Organiser une journée OOM
                  </a>
                  <a
                    href="#offers"
                    className="rounded-full py-2.75 px-5.5 text-[11px] uppercase tracking-[0.14em] bg-transparent text-[#111] border border-[#e2d7c7] hover:border-[#111] transition-colors inline-flex items-center justify-center"
                  >
                    Voir les formats
                  </a>
                </div>
                <p className="text-[12px] text-[#7a746b]">
                  Disponible à Paris et en Île de France. Autres villes sur demande.
                </p>
              </div>
              <div className="rounded-[20px] overflow-hidden border border-[#e2d7c7] bg-[#f1ebe3] min-h-[260px]">
                <img
                  src="/placeholder.svg"
                  alt="Malle OOM en situation"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2 – LOGOS */}
        <section className="border-t border-b border-[#e2d7c7] bg-[#f9f6f1] py-4.5">
          <div className="max-w-[1040px] mx-auto px-5">
            <div className="flex flex-wrap items-center gap-4 justify-between text-[12px]">
              <div className="uppercase tracking-[0.16em] text-[#7a746b]">
                Ils nous font confiance
              </div>
              <div className="flex flex-wrap gap-3.5 text-[#555]">
                <span>Mandarin Oriental</span>
                <span>Sofitel</span>
                <span>Accor</span>
                <span>Cambon Partners</span>
                <span>Tiffany & Co.</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 – PILIERS */}
        <section className="py-10 md:py-10">
          <div className="max-w-[1040px] mx-auto px-5">
            <h2 className="font-serif text-[24px] mb-3">Pourquoi OOM fonctionne</h2>
            <p className="text-[14px] text-[#7a746b] max-w-[500px] mb-6">
              Vous offrez une expérience de soin haut de gamme sans déplacer vos équipes ni transformer vos espaces.
            </p>
            <div className="grid md:grid-cols-3 gap-4.5">
              <div className="rounded-[16px] border border-[#e2d7c7] bg-white p-4.5 text-[13px] text-[#7a746b]">
                <h3 className="text-[12px] uppercase tracking-[0.16em] mb-2 text-[#111]">
                  Design iconique
                </h3>
                <p>
                  Une malle façonnée avec Pinel & Pinel. Cuir, métal, lumière. Votre salle de réunion devient un salon de beauté couture en quelques minutes.
                </p>
              </div>
              <div className="rounded-[16px] border border-[#e2d7c7] bg-white p-4.5 text-[13px] text-[#7a746b]">
                <h3 className="text-[12px] uppercase tracking-[0.16em] mb-2 text-[#111]">
                  Praticiens experts
                </h3>
                <p>
                  Coiffure mixte, barbier, soin visage, manucure. Des professionnels formés aux standards cinq étoiles, habitués aux environnements exigeants.
                </p>
              </div>
              <div className="rounded-[16px] border border-[#e2d7c7] bg-white p-4.5 text-[13px] text-[#7a746b]">
                <h3 className="text-[12px] uppercase tracking-[0.16em] mb-2 text-[#111]">
                  Logistique clé en main
                </h3>
                <p>
                  Date, horaires, réservations, produits. Vous choisissez le jour, nous gérons tout le reste sans perturber vos équipes.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4 – OFFRES */}
        <section id="offers" className="py-9 border-t border-b border-[#e2d7c7] bg-[#f9f6f1]">
          <div className="max-w-[1040px] mx-auto px-5">
            <h2 className="font-serif text-[24px] mb-4">Quatre formats, un seul niveau d'exigence</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              <div className="rounded-[14px] border border-[#e2d7c7] bg-white p-3.5 text-[12px]">
                <div className="uppercase tracking-[0.16em] mb-1.5">Aura</div>
                <div className="text-[#7a746b]">
                  Soin visage & beauty tech pour une pause régénérante.
                </div>
              </div>
              <div className="rounded-[14px] border border-[#e2d7c7] bg-white p-3.5 text-[12px]">
                <div className="uppercase tracking-[0.16em] mb-1.5">Origin</div>
                <div className="text-[#7a746b]">
                  Coiffure mixte & barbier pour un grooming impeccable.
                </div>
              </div>
              <div className="rounded-[14px] border border-[#e2d7c7] bg-white p-3.5 text-[12px]">
                <div className="uppercase tracking-[0.16em] mb-1.5">Horizon</div>
                <div className="text-[#7a746b]">
                  Coiffure, soin visage et manucure sur une seule malle.
                </div>
              </div>
              <div className="rounded-[14px] border border-[#e2d7c7] bg-white p-3.5 text-[12px]">
                <div className="uppercase tracking-[0.16em] mb-1.5">Equinox</div>
                <div className="text-[#7a746b]">
                  Deux malles, plusieurs praticiens, une journée immersive.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5 – MALLE */}
        <section id="trunk" className="py-10 md:py-10">
          <div className="max-w-[1040px] mx-auto px-5">
            <div className="grid md:grid-cols-[1.1fr_1.3fr] gap-6.5 items-center">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#7a746b] mb-1.5">
                  L'objet
                </div>
                <h2 className="font-serif text-[24px] mb-2.5">La malle qui change tout.</h2>
                <p className="text-[13px] text-[#7a746b] max-w-[420px]">
                  Modules intégrés, lumière calibrée, rangements optimisés. La malle OOM apporte instantanément la signature d'un salon premium dans vos espaces, sans travaux ni installation lourde.
                </p>
              </div>
              <div className="rounded-[18px] border border-[#e2d7c7] overflow-hidden bg-[#f1ebe3]">
                <img
                  src="/placeholder.svg"
                  alt="Détail de la malle OOM"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6 – CTA FINAL */}
        <section id="contact" className="py-8 md:py-9">
          <div className="max-w-[1040px] mx-auto px-5">
            <div className="rounded-[18px] border border-[#e2d7c7] bg-white p-6 md:p-5 text-center">
              <h2 className="font-serif text-[20px] mb-2.5">
                On organise votre première journée OOM ?
              </h2>
              <p className="text-[13px] text-[#7a746b] mb-4.5 max-w-xl mx-auto">
                Dites nous combien vous êtes et vos créneaux idéaux. Nous revenons vers vous avec un format précis et un planning prêt à être validé.
              </p>
              <a
                href="mailto:tom@oomworld.com"
                className="inline-flex items-center justify-center gap-2 rounded-full py-2.75 px-5.5 text-[11px] uppercase tracking-[0.14em] bg-[#111] text-white border border-[#111] hover:bg-[#222] transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Échanger avec OOM
              </a>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#7a746b] mt-2">
                <Phone className="w-3 h-3" />
                <span>Vous préférez un appel direct : 06 14 21 64 42</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="text-[11px] text-[#7a746b] py-4 md:py-6 border-t border-[#e2d7c7] text-center">
        OOM PARIS · Bien être & beauté mobile · Paris & Île de France
      </footer>
    </div>
  );
};

export default Landing;
