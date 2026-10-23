import {
  ArrowLeftRight,
  Ban,
  Check,
  CircleUser,
  Hourglass,
  House,
  Info,
  Landmark,
  Layers,
  MapPin,
  Medal,
  PackageOpen,
  Package,
  Pointer,
  Sparkle,
  Sparkles,
  Store,
  Timer,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { Card, type CardCollection } from '@/components/card/Card';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { AuctionTile } from '@/components/market/AuctionTile';
import { PackReserve, PackReserveCompact } from '@/components/pack/PackReserve';
import { RarityBadge } from '@/components/rarity/Rarity';
import { PackPurchasePanel, PurchaseConfirmation } from '@/components/shop/PackPurchase';
import { FriendList, FriendRow } from '@/components/social/FriendRow';
import { TradeSummary } from '@/components/trade/TradeSummary';
import { Button } from '@/components/ui/Button';
import { Gauge } from '@/components/ui/Gauge';
import { Tag } from '@/components/ui/Tag';
import { RARITIES } from '@/lib/rarity';
import { InteractiveDemo } from './InteractiveDemo';
import styles from './page.module.css';
import { defaultOdds, rarityTable, samples, tokens } from './samples';

export const metadata: Metadata = { title: 'Design system', robots: { index: false } };

const heritage: CardCollection = { name: 'Patrimoine de France', emblem: 'landmark' };

const THEMES = [
  { theme: 'light', label: 'Thème clair' },
  { theme: 'dark', label: 'Thème sombre' },
] as const;

function SectionTitle({ id, number, tone, title, children }: { id: string; number: number; tone: 'accent' | 'sage'; title: string; children: ReactNode }) {
  return (
    <div className={styles.sectionTitle}>
      <span className={styles.sectionNumber} data-tone={tone} aria-hidden="true">
        {number}
      </span>
      <div>
        <h2 id={id}>{title}</h2>
        <p className={styles.lead}>{children}</p>
      </div>
    </div>
  );
}

// Development showcase of design/Design system World Up v2.dc.html, to check the
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
        <span aria-hidden="true" className={styles.discAccent} />
        <span aria-hidden="true" className={styles.discSage} />
        <Sparkle className={styles.sparkle} aria-hidden />
        <Tag variant="accent" icon={<Landmark aria-hidden />} className={styles.introTag}>
          Patrimoine de France · charte v2
        </Tag>
        <h1>Le design system, version ludique</h1>
        <p className={styles.lead}>
          Intégration du design system World Up v2&nbsp;: le socle Organic (crème, terracotta, sauge, Caprasimo et
          Figtree), des cartes traitées comme des autocollants, l&apos;habillage lu dans <code>collections.theme</code>.
          Thème clair par défaut, thème sombre conservé. Page de développement, absente en production.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="couleurs">
        <SectionTitle id="couleurs" number={1} tone="accent" title="Couleurs">
          Le texte courant atteint 4,5:1 sur le fond dans les deux thèmes. La terracotta sert aux aplats, aux icônes
          et au gros texte ; en texte courant, on prend --color-accent-strong. La sauge est une vraie deuxième voix :
          succès, sélection, UNESCO, échanges.
        </SectionTitle>
        <div className={styles.tableWrap}>
          <table className={`table ${styles.table}`}>
            <thead>
              <tr>
                <th>Token</th>
                <th>Rôle</th>
                <th>Clair</th>
                <th>Sombre</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.name}>
                  <td>
                    <code>{token.name}</code>
                  </td>
                  <td>{token.role}</td>
                  {[token.light, token.dark].map((value, index) => (
                    <td key={index}>
                      <span className={styles.swatchCell}>
                        <span className={styles.swatch} style={{ background: value }} />
                        {value}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.skin}>
          <div className={styles.skinPack} aria-hidden="true">
            <span className={styles.skinEmblem}>
              <Landmark />
            </span>
            <span className={styles.skinKicker}>Collection</span>
            <span className={styles.skinName}>
              Patrimoine
              <br />
              de France
            </span>
          </div>
          <div className={styles.skinText}>
            <h3>Habillage « Patrimoine de France »</h3>
            <p className={styles.lead}>
              Chaque collection a sa couleur et son emblème. Pour celle-ci : la terracotta et une icône de monument,
              sur le paquet et en pied de carte. La carte reste un objet crème encré, identique dans les deux thèmes.
            </p>
            <div className={styles.row}>
              {[
                ['--skin-color', 'Terracotta #c67139', '#c67139'],
                ['--sticker-paper', 'Crème carte #f9f4ed', '#f9f4ed'],
                ['--card-ink', 'Encre #201e1d · 16:1', '#201e1d'],
                ['--card-photo-bg', 'Sauge pâle #ccdbb2', '#ccdbb2'],
              ].map(([name, label, value]) => (
                <span key={name} className={styles.skinSwatch}>
                  <span className={styles.skinDot} style={{ background: value }} />
                  <span>
                    <code>{name}</code>
                    <span className={styles.muted}>{label}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="raretes">
        <SectionTitle id="raretes" number={2} tone="sage" title="Raretés">
          Nouvelle palette, chaude et douce, commune à toutes les collections. La rareté ne passe jamais par la seule
          couleur : l&apos;étiquette porte son nom et de 1 à 6 pastilles. L&apos;encre #201e1d dépasse 4,5:1 sur les
          six teintes.
        </SectionTitle>
        <div className={styles.tableWrap}>
          <table className={`table ${styles.table}`}>
            <thead>
              <tr>
                <th>Étiquette</th>
                <th>Part du catalogue</th>
                <th>Cartes</th>
                <th>Aplat</th>
                <th>Trait (manquantes, thème clair)</th>
              </tr>
            </thead>
            <tbody>
              {RARITIES.map((rarity) => (
                <tr key={rarity}>
                  <td className={styles.stickerCell}>
                    <RarityBadge rarity={rarity} />
                  </td>
                  <td className={styles.number}>{rarityTable[rarity].share}</td>
                  <td className={styles.number}>{rarityTable[rarity].cards}</td>
                  <td>{rarityTable[rarity].fill}</td>
                  <td>
                    <span className={styles.missLine} style={{ '--line': rarityTable[rarity].line } as CSSProperties}>
                      {rarityTable[rarity].line}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="typographie">
        <SectionTitle id="typographie" number={3} tone="accent" title="Typographie">
          Caprasimo est la seule voix d&apos;affichage : titres, noms de monuments, boutons. Figtree porte tout le
          reste, avec des chiffres tabulaires pour les compteurs et les prix.
        </SectionTitle>
        <div className={styles.specimens}>
          <span className={styles.muted}>Affichage · Caprasimo 64</span>
          <span className={styles.display} style={{ fontSize: 64, lineHeight: 1.02 }}>
            Ouvrez&nbsp;!
          </span>
          <span className={styles.muted}>Titre 1 · 42</span>
          <span className={styles.display} style={{ fontSize: 42, lineHeight: 1.1 }}>
            Patrimoine de France
          </span>
          <span className={styles.muted}>Titre 2 · 32</span>
          <span className={styles.display} style={{ fontSize: 32 }}>
            Mes séries
          </span>
          <span className={styles.muted}>Titre 3 · 25</span>
          <span className={styles.display} style={{ fontSize: 25 }}>
            Dernières cartes
          </span>
          <span className={styles.muted}>Texte · Figtree 15/1,55</span>
          <span className={styles.body}>
            Un paquet gratuit arrive toutes les 10&nbsp;minutes, même quand vous n&apos;êtes pas connecté. La réserve en
            garde 10 au plus.
          </span>
          <span className={styles.muted}>Libellé · Figtree 700</span>
          <span className={styles.label}>Ultra rare · Nouveau&nbsp;!</span>
          <span className={styles.muted}>Légende · 12</span>
          <span className={styles.muted}>Photo&nbsp;: Benh LIEU SONG · domaine public</span>
          <span className={styles.muted}>Chiffres · tabulaires</span>
          <span className={styles.figures}>26&#8239;755 · 04:32 · 1,99&nbsp;€ · 4,8&nbsp;%</span>
          <span className={styles.muted}>Nom de carte · Caprasimo</span>
          <span className={styles.display} style={{ fontSize: 22, lineHeight: 1.15 }}>
            Cathédrale Saint-Gervais-et-Saint-Protais de Soissons
          </span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="formes">
        <SectionTitle id="formes" number={4} tone="sage" title="Formes, espaces et relief">
          Tout s&apos;arrondit : conteneurs à 28 px, boutons et étiquettes en pilule, ronds partout ailleurs. Le relief
          « autocollant » (contour de 2 px et ombre nette de 4 px) est réservé aux objets du jeu : cartes, paquets,
          étiquettes de rareté. L&apos;interface garde les ombres douces d&apos;Organic.
        </SectionTitle>
        <div className={styles.shapes}>
          <div className={styles.shapeRow}>
            {['space-1', 'space-2', 'space-3', 'space-4', 'space-6', 'space-8'].map((space) => (
              <figure key={space}>
                <span className={styles.space} style={{ width: `var(--${space})` }} />
                <figcaption>{space}</figcaption>
              </figure>
            ))}
          </div>
          <div className={styles.shapeRow}>
            <figure>
              <span className={styles.radius} style={{ borderRadius: 'var(--radius-md)' }} />
              <figcaption>radius-md · 16</figcaption>
            </figure>
            <figure>
              <span className={styles.radius} style={{ borderRadius: 'var(--radius-lg)' }} />
              <figcaption>radius-lg · 28</figcaption>
            </figure>
            <figure>
              <span className={styles.pill} />
              <figcaption>pilule</figcaption>
            </figure>
          </div>
          <div className={styles.shapeRow}>
            <figure>
              <span className={styles.soft} />
              <figcaption>Interface · ombre douce</figcaption>
            </figure>
            <figure>
              <span className={styles.stickerShape} />
              <figcaption>Objet de jeu · autocollant</figcaption>
            </figure>
            <figure>
              <span className={styles.touch}>
                <Pointer />
              </span>
              <figcaption>Zone tactile · 44</figcaption>
            </figure>
          </div>
        </div>
        <div className={styles.icons}>
          <House />
          <Layers />
          <ArrowLeftRight />
          <Store />
          <CircleUser />
          <PackageOpen />
          <Timer />
          <Sparkles />
          <Landmark />
          <MapPin />
          <span className={styles.muted}>Lucide, trait épaissi</span>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="composants">
        <SectionTitle id="composants" number={5} tone="accent" title="Composants">
          Le bouton principal est un aplat terracotta en pilule. Les deux colonnes sont interactives : onglets,
          affichage, case de renonciation.
        </SectionTitle>
        <div className={styles.themes}>
          {THEMES.map(({ theme, label }) => (
            <div key={theme} data-theme={theme} className={styles.themePanel}>
              <Tag variant="subtle" className={styles.themeLabel}>
                {label}
              </Tag>

              <div className={styles.group}>
                <h3>Boutons</h3>
                <div className={styles.row}>
                  <Button variant="primary" size="large" icon={<PackageOpen aria-hidden />}>
                    Ouvrir un paquet
                  </Button>
                  <Button>Voir la collection</Button>
                  <Button variant="ghost">Lire les règles</Button>
                  <Button iconOnly aria-label="Informations" icon={<Info aria-hidden />} />
                </div>
                <div className={styles.row}>
                  <Button variant="primary" disabled icon={<Package aria-hidden />}>
                    Aucun paquet
                  </Button>
                  <Button variant="sage" icon={<ArrowLeftRight aria-hidden />}>
                    Proposer l&apos;échange
                  </Button>
                  <Button variant="danger">Supprimer le compte</Button>
                </div>
              </div>

              <div className={styles.group}>
                <h3>Étiquettes</h3>
                <div className={styles.row}>
                  <Tag>Classé MH</Tag>
                  <Tag>Inscrit MH</Tag>
                  <Tag variant="sage">UNESCO</Tag>
                  <Tag variant="new">Nouveau&nbsp;!</Tag>
                  <Tag variant="count">×2</Tag>
                  <Tag variant="shiny" icon={<Sparkles aria-hidden />}>
                    Brillante
                  </Tag>
                  <Tag variant="accent" icon={<Medal aria-hidden />}>
                    Abonné
                  </Tag>
                </div>
                <div className={styles.row}>
                  <Tag variant="success" icon={<Check aria-hidden />}>
                    Échange accepté
                  </Tag>
                  <Tag variant="warning" icon={<Hourglass aria-hidden />}>
                    En attente
                  </Tag>
                  <Tag variant="danger" icon={<X aria-hidden />}>
                    Refusé
                  </Tag>
                  <Tag variant="draft">Prix fictif</Tag>
                </div>
              </div>

              <div className={styles.group}>
                <h3>Jauges</h3>
                <Gauge label="Ma collection" value={1284 / 26755} valueText="1&#8239;284 / 26&#8239;755 · 4,8&nbsp;%" />
                <Gauge label="Sites UNESCO" value={23 / 57} tone="sage" valueText="23 / 57 · 40 %" />
                <div className={styles.spending}>
                  <Gauge label="Dépensé ce mois-ci" value={0.43} tone="sage" size="small" caption="12,98 € sur 30 €" />
                  <Gauge
                    label="Dépensé ce mois-ci"
                    value={0.9}
                    tone="warning"
                    size="small"
                    captionIcon={<TriangleAlert aria-hidden />}
                    caption="Plus que 3,03 € ce mois-ci"
                  />
                  <Gauge
                    label="Dépensé ce mois-ci"
                    value={1}
                    tone="danger"
                    size="small"
                    captionIcon={<Ban aria-hidden />}
                    caption="Plafond atteint, achats bloqués jusqu'au 1er novembre"
                  />
                </div>
                <span className={styles.muted}>Montants fictifs.</span>
              </div>

              <div className={styles.group}>
                <h3>Onglets et affichage</h3>
                <InteractiveDemo id={theme} />
              </div>

              <div className={styles.group}>
                <h3>Minuteur et réserve</h3>
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
                <h3>Amis et activité</h3>
                <FriendList label="Exemples d'amis">
                  <FriendRow pseudo="Margaux" meta="Amis depuis le 3 octobre 2026">
                    <Button>Voir sa collection</Button>
                    <Button variant="ghost">Retirer</Button>
                  </FriendRow>
                  <FriendRow pseudo="élodie_b" meta="Demande du 21 octobre 2026">
                    <Button variant="primary">Accepter</Button>
                    <Button variant="ghost">Refuser</Button>
                  </FriendRow>
                </FriendList>
                <div className={styles.row}>
                  <NotificationBell unread={0} label="Activité" href="#" />
                  <NotificationBell unread={3} label="Activité, 3 non lues" href="#" />
                  <NotificationBell unread={120} label="Activité, 120 non lues" href="#" />
                  <span className={styles.muted}>La cloche de l&apos;en-tête, sans puis avec des notifications.</span>
                </div>
                <TradeSummary
                  title="Offre de Margaux"
                  state={
                    <Tag variant="warning" icon={<Hourglass aria-hidden />}>
                      En attente
                    </Tag>
                  }
                  meta="Expire le 24 oct. 2026, 19:30"
                  gives={[
                    { name: 'Château de Chambord', rarity: 'ultra', rarityLabel: 'Ultra rare', quantity: 1 },
                    { name: 'Pont du Gard', rarity: 'rare', rarityLabel: 'Rare', quantity: 2 },
                  ]}
                  gets={[{ name: 'Mont-Saint-Michel', rarity: 'legendary', rarityLabel: 'Légendaire', quantity: 1 }]}
                  labels={{ youGive: 'Vous donnez', youGet: 'Vous recevez' }}
                >
                  <Button variant="primary" icon={<ArrowLeftRight aria-hidden />}>
                    Accepter l&apos;échange
                  </Button>
                  <Button variant="ghost">Refuser</Button>
                </TradeSummary>
              </div>

              <div className={styles.group}>
                <h3>Enchères</h3>
                <ul className={styles.auctions}>
                  <li>
                    <AuctionTile
                      card={samples.gard}
                      collection={heritage}
                      href="#"
                      price={120}
                      bidCount={4}
                      buyoutPrice={400}
                      endsAt={inSeconds(2 * 86_400 + 4 * 3600)}
                      serverNow={serverNow}
                      seller="Margaux"
                      viewer="leading"
                    />
                  </li>
                  <li>
                    <AuctionTile
                      card={samples.soissons}
                      collection={heritage}
                      href="#"
                      price={15}
                      bidCount={0}
                      buyoutPrice={null}
                      endsAt={inSeconds(3 * 3600 + 12 * 60)}
                      serverNow={serverNow}
                      seller="élodie_b"
                    />
                  </li>
                  <li>
                    <AuctionTile
                      card={samples.isle}
                      collection={heritage}
                      href="#"
                      price={52}
                      bidCount={7}
                      buyoutPrice={null}
                      endsAt={inSeconds(272)}
                      serverNow={serverNow}
                      seller="Margaux"
                      viewer="outbid"
                    />
                  </li>
                  <li>
                    <AuctionTile
                      card={samples.horloge}
                      collection={heritage}
                      href="#"
                      price={30}
                      bidCount={2}
                      buyoutPrice={null}
                      endsAt={serverNow}
                      serverNow={serverNow}
                      seller="Vous"
                      viewer="seller"
                      state="sold"
                    />
                  </li>
                </ul>
                <span className={styles.muted}>
                  En tête, sans mise, dépassé dans les dernières minutes, et une vente terminée.
                </span>
              </div>

              <div className={styles.group}>
                <h3>Fenêtre d&apos;achat</h3>
                <div className={styles.dialogs}>
                  <PackPurchasePanel
                    collectionName="Patrimoine de France"
                    emblem="landmark"
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

      <section className={styles.section} aria-labelledby="carte">
        <SectionTitle id="carte" number={6} tone="sage" title="La carte">
          Nouvelle structure : une carte autocollant, la photo dans une fenêtre arrondie, l&apos;étiquette de rareté
          posée à cheval sur la photo, le nom en Caprasimo et l&apos;emblème de la collection en pied. Lisible à 160 px,
          grand format à partir de 300 px.
        </SectionTitle>
        <div className={styles.cardIntro}>
          <figure className={styles.large320}>
            <Card card={samples.eiffel} collection={heritage} size="large" flippable copies={2} />
            <figcaption>Recto · cliquer ou Entrée pour retourner</figcaption>
          </figure>
          <figure className={styles.large320}>
            <Card card={samples.eiffel} collection={heritage} size="large" face="back" copies={2} />
            <figcaption>Verso</figcaption>
          </figure>
          <div className={styles.anatomy}>
            <h3>Recto</h3>
            <ol>
              <li>
                <strong>Photo 4:3</strong> dans une fenêtre arrondie ; verticales et panoramas posés sur un fond flouté
                de la même photo.
              </li>
              <li>
                <strong>Étiquette de rareté</strong> à cheval sur la photo : couleur, nom, 1 à 6 pastilles.
              </li>
              <li>
                <strong>Nom</strong> en Caprasimo, 3 lignes au plus.
              </li>
              <li>
                <strong>Lieu</strong> : le département, plus la région en grand format.
              </li>
              <li>
                <strong>Étiquettes</strong> : Classé MH ou Inscrit MH, UNESCO en sauge.
              </li>
              <li>
                <strong>Pied</strong> : emblème de la collection, série régionale, numéro.
              </li>
            </ol>
            <p className={styles.muted}>Crédit photo sous l&apos;image en grand format, derrière le « i » en grille.</p>
            <h3>Verso</h3>
            <p className={styles.lead}>
              Extrait de l&apos;article et lien, mention de licence Wikipédia, crédit photo complet avec lien vers
              Commons, exemplaires possédés.
            </p>
          </div>
        </div>

        <h3>Les six raretés, grille 160&nbsp;px</h3>
        <div className={styles.grid160}>
          {[samples.notreDame, samples.soissons, samples.isle, samples.napoleon, samples.compiegne, samples.horloge].map((card) => (
            <Card key={card.name} card={card} collection={heritage} />
          ))}
          <Card card={samples.thoronet} collection={heritage} face="back" />
        </div>
        <span className={styles.muted}>
          La dernière carte montre le verso en grille : extrait abrégé, crédit et exemplaires, sans lien (l&apos;appui
          ouvre la fiche).
        </span>

        <h3>Les six raretés, grand format</h3>
        <div className={styles.grid300}>
          {[samples.chambord, samples.thoronet, samples.stuarts, samples.napoleon, samples.compiegne, samples.attigny].map((card) => (
            <Card key={card.name} card={card} collection={heritage} size="large" />
          ))}
        </div>

        <h3>États</h3>
        <p className={styles.lead}>
          Manquante : contour en pointillés, photo désaturée, étiquette au trait. Nom masqué : un « ? » à la place de
          la photo (Légendaires et Ultra rares). Brillante : reflet irisé et pastille.
        </p>
        <div className={styles.themes}>
          {THEMES.map(({ theme, label }) => (
            <div key={theme} data-theme={theme} className={styles.themePanel}>
              <Tag variant="subtle" className={styles.themeLabel}>
                {label}
              </Tag>
              <div className={styles.grid160}>
                <figure>
                  <Card card={samples.napoleon} collection={heritage} />
                  <figcaption>Possédée</figcaption>
                </figure>
                <figure>
                  <Card card={samples.thoronet} collection={heritage} isNew />
                  <figcaption>Nouvelle</figcaption>
                </figure>
                <figure>
                  <Card card={samples.compiegne} collection={heritage} copies={3} />
                  <figcaption>Doublon ×3</figcaption>
                </figure>
                <figure>
                  <Card card={samples.stuarts} collection={heritage} shiny />
                  <figcaption>Brillante</figcaption>
                </figure>
                <figure>
                  <Card card={samples.attigny} collection={heritage} selected />
                  <figcaption>Sélectionnée pour un échange</figcaption>
                </figure>
                <figure>
                  <Card card={samples.horloge} collection={heritage} state="missing" />
                  <figcaption>Manquante, nom visible</figcaption>
                </figure>
                <figure>
                  <Card card={{ ...samples.chambord, photo: { ...samples.chambord.photo, src: '' } }} collection={heritage} state="masked" />
                  <figcaption>Manquante, nom masqué</figcaption>
                </figure>
              </div>
            </div>
          ))}
        </div>

        <h3>Cas limites</h3>
        <p className={styles.lead}>
          Hors du rapport 1,1 à 1,9, la photo entière se pose sur un fond flouté d&apos;elle-même.
        </p>
        <div className={styles.grid300}>
          <figure>
            <Card card={samples.gard} collection={heritage} size="large" />
            <figcaption>Panorama 12&#8239;648 × 4&#8239;882</figcaption>
          </figure>
          <figure>
            <Card card={samples.soissons} collection={heritage} size="large" />
            <figcaption>Nom de 53 caractères, auteur non renseigné</figcaption>
          </figure>
          <figure>
            <Card card={samples.horloge} collection={heritage} size="large" />
            <figcaption>Photo de 396 × 528&nbsp;px</figcaption>
          </figure>
          <figure>
            <Card card={samples.isle} collection={heritage} size="large" />
            <figcaption>Photo de 768 × 1&#8239;024&nbsp;px</figcaption>
          </figure>
          <figure>
            <Card card={samples.boyard} collection={heritage} size="large" />
            <figcaption>Photo indisponible&nbsp;: aplat au nom du monument</figcaption>
          </figure>
        </div>
        <div className={styles.grid160}>
          <Card card={samples.gard} collection={heritage} />
          <Card card={samples.soissons} collection={heritage} />
          <Card card={samples.isle} collection={heritage} />
          <Card card={samples.horloge} collection={heritage} />
          <Card card={samples.boyard} collection={heritage} />
          <Card card={samples.notreDame} collection={heritage} />
        </div>
      </section>
    </main>
  );
}
