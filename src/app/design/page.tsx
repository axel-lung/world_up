import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  CheckIcon,
  HourglassIcon,
  InfoIcon,
  MedalIcon,
  PackageIcon,
  ProhibitIcon,
  SparkleIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react/ssr';
import { Card } from '@/components/card/Card';
import { PackReserve, PackReserveCompact } from '@/components/pack/PackReserve';
import { RarityBadge } from '@/components/rarity/Rarity';
import { PackPurchasePanel, PurchaseConfirmation } from '@/components/shop/PackPurchase';
import { Button } from '@/components/ui/Button';
import { Gauge } from '@/components/ui/Gauge';
import { Tag } from '@/components/ui/Tag';
import { RARITIES } from '@/lib/rarity';
import { InteractiveDemo } from './InteractiveDemo';
import styles from './page.module.css';
import { defaultOdds, samples } from './samples';

export const metadata: Metadata = { title: 'Design system', robots: { index: false } };

// Development showcase of design/Design system World Up.dc.html, to check the
// integration against the mock-up. Its section titles and sample values are
// not game text, so they stay out of messages/fr.json. Production never serves
// it: the photos come straight from Wikimedia Commons.
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const now = new Date();
  const serverNow = now.toISOString();
  const inSeconds = (seconds: number) => new Date(now.getTime() + seconds * 1000).toISOString();

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <span className={styles.kicker}>Patrimoine de France · habillage 1a « Panneau touristique »</span>
        <h1>Design system</h1>
        <p className={styles.lead}>
          Intégration du design system World Up (nom provisoire)&nbsp;: socle Nocturne, thèmes clair et sombre,
          habillage lu dans <code>collections.theme</code>. Page de développement, absente en production.
        </p>
      </header>

      <section className={styles.section}>
        <h2>Raretés</h2>
        <div className={styles.row}>
          {RARITIES.map((rarity) => (
            <RarityBadge key={rarity} rarity={rarity} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Composants</h2>
        <div className={styles.themes}>
          {(['dark', 'light'] as const).map((theme) => (
            <div key={theme} data-theme={theme} className={styles.themePanel}>
              <span className={styles.muted}>{theme === 'dark' ? 'Thème sombre' : 'Thème clair'}</span>

              <div className={styles.group}>
                <h3 className={styles.groupTitle}>Boutons</h3>
                <div className={styles.row}>
                  <Button variant="primary" icon={<PackageIcon size={18} aria-hidden />}>
                    Ouvrir un paquet
                  </Button>
                  <Button>Voir la collection</Button>
                  <Button variant="ghost">Lire les règles</Button>
                  <Button iconOnly aria-label="Informations" icon={<InfoIcon size={20} aria-hidden />} />
                </div>
                <div className={styles.row}>
                  <Button variant="primary" disabled icon={<PackageIcon size={18} aria-hidden />}>
                    Aucun paquet
                  </Button>
                  <Button>Résilier mon abonnement</Button>
                  <Button variant="danger">Supprimer le compte</Button>
                </div>
              </div>

              <div className={styles.group}>
                <h3 className={styles.groupTitle}>Badges</h3>
                <div className={styles.row}>
                  <Tag>Classé MH</Tag>
                  <Tag>Inscrit MH</Tag>
                  <Tag>UNESCO</Tag>
                  <Tag variant="new">Nouveau</Tag>
                  <Tag variant="count">×2</Tag>
                  <Tag variant="shiny" icon={<SparkleIcon weight="fill" aria-hidden />}>
                    Brillante
                  </Tag>
                  <Tag variant="accent" icon={<MedalIcon aria-hidden />}>
                    Abonné
                  </Tag>
                  <Tag variant="subtle">nom provisoire</Tag>
                </div>
                <div className={styles.row}>
                  <Tag variant="success" icon={<CheckIcon aria-hidden />}>
                    Échange accepté
                  </Tag>
                  <Tag variant="warning" icon={<HourglassIcon aria-hidden />}>
                    En attente
                  </Tag>
                  <Tag variant="danger" icon={<XIcon aria-hidden />}>
                    Refusé
                  </Tag>
                  <Tag variant="draft">Prix fictif</Tag>
                </div>
              </div>

              <div className={styles.group}>
                <h3 className={styles.groupTitle}>Jauges</h3>
                <Gauge label="Ma collection" value={1284 / 26755} valueText="1&#8239;284 / 26&#8239;755 · 4,8&nbsp;%" />
                <Gauge label="Sites UNESCO" value={23 / 57} valueText="23 / 57 · 40 %" />
                <div className={styles.spending}>
                  <Gauge label="Dépensé ce mois-ci" value={0.43} caption="12,98 € sur 30 €" />
                  <Gauge
                    label="Dépensé ce mois-ci"
                    value={0.9}
                    tone="warning"
                    captionIcon={<WarningIcon aria-hidden />}
                    caption="Plus que 3,03 € ce mois-ci"
                  />
                  <Gauge
                    label="Dépensé ce mois-ci"
                    value={1}
                    tone="danger"
                    captionIcon={<ProhibitIcon aria-hidden />}
                    caption="Plafond atteint, achats bloqués jusqu'au 1er novembre"
                  />
                </div>
              </div>

              <div className={styles.group}>
                <h3 className={styles.groupTitle}>Onglets et affichage</h3>
                <InteractiveDemo id={theme} />
              </div>

              <div className={styles.group}>
                <h3 className={styles.groupTitle}>Minuteur et réserve</h3>
                <div className={styles.reserves}>
                  <PackReserve available={7} max={10} nextPackAt={inSeconds(272)} serverNow={serverNow} refillMinutes={10} />
                  <PackReserve available={10} max={10} nextPackAt={null} serverNow={serverNow} refillMinutes={10} />
                  <PackReserve available={0} max={10} nextPackAt={inSeconds(552)} serverNow={serverNow} refillMinutes={10} />
                  <div className={styles.compactBox}>
                    <PackReserveCompact available={7} max={10} nextPackAt={inSeconds(272)} serverNow={serverNow} />
                    <span className={styles.muted}>Version compacte, pour l&apos;en-tête.</span>
                  </div>
                </div>
              </div>

              <div className={styles.group}>
                <h3 className={styles.groupTitle}>Fenêtre d&apos;achat</h3>
                <div className={styles.dialogs}>
                  <PackPurchasePanel
                    collectionName="Patrimoine de France"
                    cardsPerPack={5}
                    price={1.99}
                    fictitiousPrice
                    odds={[...defaultOdds]}
                    monthlyCap={{ available: 17.02, cap: 30 }}
                  />
                  <PurchaseConfirmation product="Paquet Patrimoine de France" price={1.99} fictitiousPrice />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>La carte</h2>
        <div className={styles.row}>
          <figure className={styles.large320}>
            <Card card={samples.eiffel} size="large" flippable copies={2} />
            <figcaption>Recto · cliquer pour retourner</figcaption>
          </figure>
          <figure className={styles.large320}>
            <Card card={samples.eiffel} size="large" face="back" copies={2} />
            <figcaption>Verso</figcaption>
          </figure>
        </div>

        <h3>Les six raretés, grille 160&nbsp;px</h3>
        <div className={styles.grid160}>
          {[samples.chambord, samples.thoronet, samples.stuarts, samples.napoleon, samples.compiegne, samples.attigny].map((card) => (
            <Card key={card.name} card={card} />
          ))}
        </div>

        <h3>Les six raretés, grand format</h3>
        <div className={styles.grid300}>
          {[samples.chambord, samples.thoronet, samples.stuarts, samples.napoleon, samples.compiegne, samples.attigny].map((card) => (
            <Card key={card.name} card={card} size="large" />
          ))}
        </div>

        <h3>États</h3>
        <div className={styles.themes}>
          {(['dark', 'light'] as const).map((theme) => (
            <div key={theme} data-theme={theme} className={styles.themePanel}>
              <div className={styles.grid160}>
                <figure>
                  <Card card={samples.thoronet} isNew />
                  <figcaption>Nouvelle</figcaption>
                </figure>
                <figure>
                  <Card card={samples.compiegne} copies={3} />
                  <figcaption>Doublon ×3</figcaption>
                </figure>
                <figure>
                  <Card card={samples.stuarts} shiny />
                  <figcaption>Brillante</figcaption>
                </figure>
                <figure>
                  <Card card={samples.attigny} selected />
                  <figcaption>Sélectionnée</figcaption>
                </figure>
                <figure>
                  <Card card={samples.horloge} state="missing" />
                  <figcaption>Manquante, nom visible</figcaption>
                </figure>
                <figure>
                  <Card card={samples.chambord} state="masked" />
                  <figcaption>Manquante, nom masqué</figcaption>
                </figure>
                <figure>
                  <Card card={samples.thoronet} face="back" />
                  <figcaption>Verso en grille</figcaption>
                </figure>
              </div>
            </div>
          ))}
        </div>

        <h3>Cas limites</h3>
        <div className={styles.grid300}>
          <figure>
            <Card card={samples.gard} size="large" />
            <figcaption>Panorama 12&#8239;648 × 4&#8239;882</figcaption>
          </figure>
          <figure>
            <Card card={samples.soissons} size="large" />
            <figcaption>Nom de 53 caractères, auteur non renseigné</figcaption>
          </figure>
          <figure>
            <Card card={samples.isle} size="large" />
            <figcaption>Photo de 768 × 1&#8239;024&nbsp;px</figcaption>
          </figure>
          <figure>
            <Card card={samples.horloge} size="large" />
            <figcaption>Photo de 396 × 528&nbsp;px</figcaption>
          </figure>
          <figure>
            <Card card={samples.boyard} size="large" />
            <figcaption>Photo indisponible&nbsp;: aplat au nom du monument</figcaption>
          </figure>
        </div>
        <div className={styles.grid160}>
          <Card card={samples.gard} />
          <Card card={samples.soissons} />
          <Card card={samples.isle} />
          <Card card={samples.horloge} />
          <Card card={samples.boyard} />
          <Card card={samples.notreDame} />
        </div>
      </section>
    </main>
  );
}
