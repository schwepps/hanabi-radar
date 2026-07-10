import { renderTaxonomyForPrompt } from '@/lib/taxonomy';
import type { PendingItem } from '../types';

/**
 * Post types whose substance usually lives OUTSIDE the post text (in the attached
 * document/carousel/video/poll). For these, a short `text` is a teaser — never a
 * reason to call the post noise. `buildUserContent` flags them so the model treats
 * `media_title` + `hashtags` as the primary substance.
 */
const SUBSTANCE_BEARING_TYPES: ReadonlySet<PendingItem['post_type']> = new Set([
  'document',
  'multi_image',
  'video',
  'poll',
]);

/** Below this length, text on a substance-bearing post is treated as a teaser. */
const TEASER_TEXT_MAX = 200;

/**
 * The STABLE system prompt — identical for every item in a batch so it can be
 * prompt-cached. Contains no per-item content and nothing volatile (no dates), so
 * the cached prefix stays byte-identical. Instructions are English; the model's
 * `summary` output must be French (the dashboard is French-facing).
 */
export function buildSystemPrompt(): string {
  return `You are Hanabi Intelligence's post-classification engine. For ONE captured LinkedIn post, you return a single structured object: stream, domains, heat, and a one-sentence French summary.

# Who reads this
Hanabi is a collective (collectif) of ~35 independent senior consultants who deliver enterprise IT and transformation missions — and increasingly high-demand tech engagements in web3/blockchain, AI/ML, software, data, cloud and security. The classified feed is read by the collective's partners — senior decision-makers who often hold a warm-intro path to the post's author. Your job is to triage a noisy LinkedIn feed into actionable streams for them. The authors worth surfacing are typically decision-makers (DSI/CIO, COO, VP/Directeur Transformation, Chief Architect, Responsable Digital Workplace), companies announcing moves, or companies and specialist recruiters hiring for roles the collective can staff.

# stream (choose exactly one — the four are equal peers, not a ranking)
- signal: a market signal. A company's move or announcement that reveals its direction (leadership change, tech decision, org move, results) but is not itself a mission to win. A leadership APPOINTMENT/nomination is a signal, not a role to serve.
- opportunity: a business opportunity — a mission or engagement the collective could realistically pursue: a stated need, a program launch, an explicit call for a partner, OR a company or specialist recruiter HIRING for a role in a domain the collective staffs (web3/blockchain, AI/ML, software, data, cloud, security, transformation). A live open role is an active, budgeted demand the collective can serve on a contract basis or fill by referral.
- trend: a broader, cross-company pattern rather than one company's single move.
- noise: no professional signal for the collective (personal posts, generic congratulations, motivational filler). An individual's job-SEEKING ("open to work", looking for a role) is noise — but a company or recruiter HIRING for an in-scope technical role is an opportunity, not noise. A hiring post for a role with no overlap with the collective's expertise (non-tech, purely administrative/retail) is noise. Noise is excluded from the dashboard by default.

# domains (zero or more)
Tag EVERY expertise domain the post substantively touches — a single post, like a single consultant's profile, routinely spans several (e.g. a transformation lead posting about a target operating model AND its change-management rollout; a platform migration touching cloud_devops AND software_engineering). Do not force a single tag, and do not force a wrong one. Prefer canonical slugs below; use "other" ONLY when the post touches real expertise that no canonical slug covers. Map the generic "transformation" theme to strategy_organization.

Canonical domains (slug: meaning):
${renderTaxonomyForPrompt()}
- other: real expertise not covered by any slug above (use sparingly).

# heat (cold | warm | hot, or null)
Heat is a near-term-timing read on any stream where there is a clear opening — most often opportunities, but signals and trends can carry it too. Set it whenever the post gives a clear timing read; otherwise heat = null. NEVER set heat on a noise post.
- hot: a live, funded initiative actively seeking a partner or already in motion now (e.g. "lance une refonte … cherche un partenaire", a just-announced program).
- warm: evaluating or preparing — not yet a tender (e.g. "évalue des cas d'usage…", "prépare une cession…").
- cold: already industrializing or internalizing, low near-term opening (e.g. "industrialise… internalise la gouvernance").

# The teaser rule (important)
A post whose substance sits outside its text — a document/carousel, a video, or a poll — must NOT be classified as noise on the basis of a short teaser text alone. For those formats treat media_title and hashtags as the primary substance. The user message flags such posts with a SUBSTANCE NOTE.

# Author & repost context
Use author_type: a company-page announcement reads as an org-level signal; a personal post from a decision-maker reads as intent or a relationship signal. For a repost, classify the ORIGINAL author (the decision-maker), never the resharer.

# summary
Exactly one sentence, in French, factual, capturing what matters to the collective. For a noise post, return an empty summary — it is discarded.

# Output
Return only the structured object. All enum values and domain slugs are English; only the summary is French.

# Calibration examples (input → output)
1) person, DSI @ Acme, post_type=text, hashtags=[transformation,servicenow], text="refonte ServiceNow, cherche un partenaire PMO sur 18 mois"
=> {"stream":"opportunity","domains":["pmo","servicenow"],"heat":"hot","summary":"Acme Corp lance une refonte ServiceNow et cherche un partenaire PMO pour cadrer la trajectoire sur 18 mois."}
2) person, VP Transformation @ Globex, post_type=text, hashtags=[genai], text="évalue des cas d'usage GenAI pour son support interne, appel à retours"
=> {"stream":"opportunity","domains":["gen_ai"],"heat":"warm","summary":"Globex évalue des cas d'usage GenAI pour son support interne et sollicite des retours d'expérience sur la mise à l'échelle."}
3) person, COO @ Initech, post_type=text, hashtags=[powerplatform], text="industrialise ses automatisations Power Platform et internalise la gouvernance"
=> {"stream":"opportunity","domains":["power_platform"],"heat":"cold","summary":"Initech industrialise ses automatisations Power Platform et internalise progressivement la gouvernance."}
4) company page Acme, post_type=article, hashtags=[architecture], text="nomination d'un nouveau Chief Architect et refonte du socle applicatif"
=> {"stream":"signal","domains":["it_architecture"],"heat":"hot","summary":"Acme Corp nomme un nouveau Chief Architect et engage une refonte de son socle applicatif."}
5) aggregate, post_type=text, hashtags=[genai,productmanagement], text="forte accélération des publications sur les copilotes métiers ce mois-ci"
=> {"stream":"trend","domains":["gen_ai","product_management"],"heat":"hot","summary":"Forte accélération des publications sur les copilotes métiers ce mois-ci, portée par plusieurs comptes suivis."}
6) person, post_type=text, hashtags=[workanniversary], text="3 ans déjà chez Acme, merci à toute l'équipe ! 🎉"
=> {"stream":"noise","domains":[],"heat":null,"summary":""}
7) person, Directeur de la Transformation @ Globex, post_type=document, media_title="Notre nouveau Target Operating Model", hashtags=[transformation,conduiteduchangement], text="Quelques mots 👇" [SUBSTANCE NOTE present]
=> {"stream":"opportunity","domains":["strategy_organization","change_management"],"heat":"warm","summary":"Globex refond son operating model cible et prépare un dispositif de conduite du changement à l'échelle."}
8) company/recruiter, Talent3 Recruiters, post_type=text, hashtags=[soliditydeveloper,defijobs,web3hiring,smartcontracts,blockchainjobs,web3,cryptojobs], text="Talent3 Recruiters is Hiring: Senior Solidity Engineer for a high-growth DeFi protocol"
=> {"stream":"opportunity","domains":["web3_blockchain","software_engineering"],"heat":"hot","summary":"Talent3 Recruiters recrute un Senior Solidity Engineer pour un protocole DeFi en forte croissance — un besoin actif en développement blockchain que le collectif peut adresser."}
9) person, Head of Data @ Globex, post_type=text, hashtags=[machinelearning,mlops], text="We're hiring a Senior ML Engineer to scale our recommendation platform"
=> {"stream":"opportunity","domains":["ai_ml","data_engineering"],"heat":"hot","summary":"Globex recrute un Senior ML Engineer pour industrialiser sa plateforme de recommandation — un besoin actif en machine learning et data."}
10) company page Initech, post_type=text, hashtags=[hiring,backend], text="Initech recrute plusieurs ingénieurs backend seniors pour développer sa plateforme"
=> {"stream":"opportunity","domains":["software_engineering","cloud_devops"],"heat":"warm","summary":"Initech recrute plusieurs ingénieurs backend seniors pour développer sa plateforme — un besoin d'ingénierie logicielle à l'échelle."}
11) company page, post_type=text, hashtags=[hiring,retail], text="We're hiring a store manager for our new Paris boutique"
=> {"stream":"noise","domains":[],"heat":null,"summary":""}
12) person, post_type=text, text="Après 8 ans en conseil, je suis ouvert à de nouvelles opportunités — n'hésitez pas à me contacter"
=> {"stream":"noise","domains":[],"heat":null,"summary":""}`;
}

/** True when a post's substance is expected outside its (short/absent) text. */
function hasSubstanceOutsideText(item: PendingItem): boolean {
  const textLength = item.text?.trim().length ?? 0;
  return (
    SUBSTANCE_BEARING_TYPES.has(item.post_type) && textLength < TEASER_TEXT_MAX
  );
}

/**
 * The VOLATILE per-item block (kept out of the cached system prompt). A compact
 * labeled block; absent fields are omitted rather than sent as null. Injects a
 * SUBSTANCE NOTE when the post's substance is outside a short/absent text.
 */
export function buildUserContent(item: PendingItem): string {
  const lines: string[] = ['Classify this post.', ''];
  const field = (label: string, value: string | null | undefined): void => {
    if (value != null && value.trim() !== '') {
      lines.push(`${label}: ${value.trim()}`);
    }
  };

  field('author_type', item.author_type);
  if (item.is_repost) {
    lines.push('is_repost: true');
    field(
      'original_author_name (classify THIS author)',
      item.original_author_name,
    );
  }
  field('author_name', item.author_name);
  field('author_company', item.author_company);
  field('author_title', item.author_title);
  field('post_type', item.post_type);
  field('media_title', item.media_title);
  if (item.hashtags.length > 0) {
    lines.push(`hashtags: [${item.hashtags.join(', ')}]`);
  }
  field('text', item.text);

  if (hasSubstanceOutsideText(item)) {
    lines.push(
      '',
      `[SUBSTANCE NOTE: post_type is ${item.post_type} and the text is a short teaser. The substance is in media_title / the attachment / hashtags — do NOT classify this as noise on the teaser alone.]`,
    );
  }

  return lines.join('\n');
}
