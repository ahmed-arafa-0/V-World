import type { ParseTabResult } from '@veoullas-world/sheet-schema';
import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * `church_starter_5_locales.json` proposals mapped onto `30_CHURCH_CONTENT`'s real columns.
 *
 * The live `church_verse_001` `en`/`ar-EG` rows (read 2026-09-22) already carry real metadata that
 * must be preserved exactly, per the package's own instruction ("preserve existing row IDs,
 * metadata and schedule"): `title` = "Birthday Verse" / "آية عيد الميلاد", `active_date` =
 * 2026-09-26, `review_status` = pending_review, `enabled` = FALSE. Only the placeholder `text`,
 * `bible_reference` and `source_url` cells (`<REVIEWED VERSE TEXT>` / `<نص الآية بعد المراجعة>`,
 * `<REFERENCE>`, `<APPROVED_SOURCE_URL>`) are ever replaced — mirrors
 * `welcome-message-seed.service.ts`'s exact-placeholder-only replacement pattern. `title` and
 * `active_date` are NOT touched by this seed; Ahmed should confirm separately whether "Birthday
 * Verse" / 2026-09-26 is the intended framing for this row, since the package's own proposed verse
 * (Matthew 11:28, "Come unto me...") does not itself reference a birthday.
 *
 * The `it`/`el`/`fr` locale rows for `church_verse_001` do not exist at all yet (only `en`/`ar-EG`
 * are live) — those are pure inserts, using the live rows' own `active_date`/`review_status`/
 * `enabled` so all 5 locales of one verse stay in lockstep. No `voiceover_id` is assigned to the
 * new rows (CLAUDE.md §17: no voice-over, anywhere, ever again).
 *
 * The 3 Bible stories (`church_story_storm_001`, `church_story_sheep_001`,
 * `church_story_samaritan_001`) are brand-new `content_id`s with no existing row of any locale —
 * pure inserts, `content_type: 'story'`, `active_date` left BLANK (the package proposes no date;
 * inventing one would be a scheduling decision that belongs to Ahmed, matching the church verse's
 * open `active_date` precedent). `image_asset_ids` is left BLANK: the package's own
 * `asset_status: 'not_generated'` confirms no art exists yet, and no `10_ASSETS` row exists for
 * `church_story_*_001_image` either (confirmed against the 2026-09-22 live read and
 * `docs/content/REAL_CONTENT_GAPS.md`) — writing that id into `image_asset_ids` now would be a
 * dangling reference to an asset that doesn't exist, to be revisited once real art is generated and
 * registered. `review_status: 'pending_review'` matches the only existing precedent in this table
 * (both live `church_verse_001` rows already use `pending_review`, not `draft`).
 */

export interface ChurchVersePlanInput {
  texts: Readonly<Record<'en' | 'ar-EG', string>>;
  bibleReference: string;
  sourceUrlByLocale: Readonly<Record<'en' | 'ar-EG', string>>;
}

const VERSE_PLACEHOLDER_TEXT: Readonly<Record<'en' | 'ar-EG', string>> = {
  en: '<REVIEWED VERSE TEXT>',
  'ar-EG': '<نص الآية بعد المراجعة>',
};
const VERSE_PLACEHOLDER_REFERENCE = '<REFERENCE>';
const VERSE_PLACEHOLDER_SOURCE_URL = '<APPROVED_SOURCE_URL>';

export interface ChurchVersePlan {
  rows: {
    id: string;
    locale: 'en' | 'ar-EG';
    before: Record<string, string>;
    after: Record<string, string>;
    action: 'update' | 'unchanged';
  }[];
  conflicts: { id: string; reason: string }[];
}

/** Formula-aware exact-cell plan for the two existing `church_verse_001` rows — never touches title/active_date/review_status/enabled. */
export function planChurchVerseReplacement(
  table: ParseTabResult,
  formulas: string[][],
  input: ChurchVersePlanInput,
): ChurchVersePlan {
  const plan: ChurchVersePlan = { rows: [], conflicts: [] };
  const header = formulas[0] ?? [];
  const keyIndex = header.indexOf('content_row_id');
  const textIndex = header.indexOf('text');
  const referenceIndex = header.indexOf('bible_reference');
  const sourceIndex = header.indexOf('source_url');
  if (keyIndex < 0 || textIndex < 0 || referenceIndex < 0 || sourceIndex < 0) {
    throw new Error('Formula-preserving preview requires the church content header.');
  }
  for (const locale of ['en', 'ar-EG'] as const) {
    const id = `church_verse_001_${locale === 'en' ? 'en' : 'ar'}`;
    const matches = table.rows.filter((r) => r.primaryKeyValue === id);
    const row = matches[0];
    const cells = formulas.slice(1).filter((r) => r[keyIndex] === id);
    const cellRow = cells[0];
    const desiredText = input.texts[locale];
    const desiredSourceUrl = input.sourceUrlByLocale[locale];
    const reason =
      matches.length !== 1 || cells.length !== 1
        ? 'Missing or duplicate existing row'
        : row?.raw.content_id !== 'church_verse_001' ||
            row?.raw.content_type !== 'verse' ||
            row?.raw.locale !== locale
          ? 'Unexpected identity, content_type or locale'
          : [cellRow?.[textIndex], cellRow?.[referenceIndex], cellRow?.[sourceIndex]].some((c) =>
                (c ?? '').startsWith('='),
              )
            ? 'Existing cell contains a formula'
            : !desiredText?.trim()
              ? 'Approved verse text missing'
              : (cellRow?.[textIndex] ?? '').trim() &&
                  cellRow?.[textIndex] !== VERSE_PLACEHOLDER_TEXT[locale] &&
                  cellRow?.[textIndex] !== desiredText
                ? 'Different nonblank authored verse text'
                : (cellRow?.[referenceIndex] ?? '').trim() &&
                    cellRow?.[referenceIndex] !== VERSE_PLACEHOLDER_REFERENCE &&
                    cellRow?.[referenceIndex] !== input.bibleReference
                  ? 'Different nonblank authored bible_reference'
                  : (cellRow?.[sourceIndex] ?? '').trim() &&
                      cellRow?.[sourceIndex] !== VERSE_PLACEHOLDER_SOURCE_URL &&
                      cellRow?.[sourceIndex] !== desiredSourceUrl
                    ? 'Different nonblank authored source_url'
                    : null;
    if (reason) {
      plan.conflicts.push({ id, reason });
      continue;
    }
    const after = {
      ...row!.raw,
      text: desiredText!,
      bible_reference: input.bibleReference,
      source_url: desiredSourceUrl!,
    };
    plan.rows.push({
      id,
      locale,
      before: { ...row!.raw },
      after,
      action: JSON.stringify(after) === JSON.stringify(row!.raw) ? 'unchanged' : 'update',
    });
  }
  return plan;
}

/** The normal backend gateway. Never appends or writes player tabs; never touches title/active_date/review_status/enabled. */
export async function applyChurchVerseReplacement(
  gateway: SheetGateway,
  plan: ChurchVersePlan,
): Promise<string[]> {
  if (plan.conflicts.length)
    throw new Error('Church verse conflicts must be resolved before applying.');
  const found = await Promise.all(
    plan.rows.map((r) =>
      gateway.findByPrimaryKey('30_CHURCH_CONTENT', r.id, { bypass: true, strict: true }),
    ),
  );
  for (const [i, row] of plan.rows.entries()) {
    if (!found[i] || JSON.stringify(found[i]!.row.raw) !== JSON.stringify(row.before))
      throw new Error(`Row changed after preview: ${row.id}`);
  }
  const changed: string[] = [];
  for (const [i, row] of plan.rows.entries()) {
    if (row.action === 'unchanged') continue;
    await gateway.updateByPrimaryKey(
      '30_CHURCH_CONTENT',
      row.id,
      {
        text: row.after.text!,
        bible_reference: row.after.bible_reference!,
        source_url: row.after.source_url!,
      },
      found[i],
    );
    changed.push(row.id);
  }
  return changed;
}

const LOCALES = [
  { locale: 'en', suffix: 'en', direction: 'ltr' },
  { locale: 'ar-EG', suffix: 'ar', direction: 'rtl' },
  { locale: 'it', suffix: 'it', direction: 'ltr' },
  { locale: 'el', suffix: 'el', direction: 'ltr' },
  { locale: 'fr', suffix: 'fr', direction: 'ltr' },
] as const;

/** Only the 3 new locales for the already-live `church_verse_001`; mirrors the live `en`/`ar-EG` rows' schedule/review/enabled state. */
export function buildChurchVerseLocaleFillRows(
  input: ChurchVersePlanInput,
  scheduleAndStatus: { activeDate: string; reviewStatus: string; enabled: string },
): Record<string, string>[] {
  const texts: Record<string, string> = {
    it: 'Venite a me, voi tutti che siete travagliati ed aggravati, ed io vi darò riposo.',
    el: 'Δεῦτε πρός με πάντες οἱ κοπιῶντες καὶ πεφορτισμένοι, κἀγὼ ἀναπαύσω ὑμᾶς.',
    fr: 'Venez à moi, vous tous qui êtes fatigués et chargés, et je vous donnerai du repos.',
  };
  const titles: Record<string, string> = {
    it: 'Versetto di compleanno',
    el: 'Εδάφιο γενεθλίων',
    fr: 'Verset d’anniversaire',
  };
  return LOCALES.filter((l) => l.locale === 'it' || l.locale === 'el' || l.locale === 'fr').map(
    (l) => ({
      content_row_id: `church_verse_001_${l.suffix}`,
      content_id: 'church_verse_001',
      content_type: 'verse',
      active_date: scheduleAndStatus.activeDate,
      locale: l.locale,
      title: titles[l.locale]!,
      text: texts[l.locale]!,
      direction: l.direction,
      image_asset_ids: '',
      voiceover_id: '',
      bible_reference: input.bibleReference,
      source_url: input.sourceUrlByLocale.en,
      review_status: scheduleAndStatus.reviewStatus,
      enabled: scheduleAndStatus.enabled,
    }),
  );
}

export interface ChurchStoryProposal {
  contentId: string;
  reference: string;
  sourceUrl: string;
  title: Readonly<Record<'en' | 'ar-EG' | 'it' | 'el' | 'fr', string>>;
  text: Readonly<Record<'en' | 'ar-EG' | 'it' | 'el' | 'fr', string>>;
}

export const CHURCH_STORY_PROPOSALS: readonly ChurchStoryProposal[] = [
  {
    contentId: 'church_story_storm_001',
    reference: 'Mark 4:35–41',
    sourceUrl: 'https://www.bible.com/ar/bible/13/MRK.4.AVD',
    title: {
      en: 'Calm After the Storm',
      'ar-EG': 'هدوء بعد العاصفة',
      it: 'La calma dopo la tempesta',
      el: 'Γαλήνη μετά την καταιγίδα',
      fr: 'Le calme après la tempête',
    },
    text: {
      en: 'Wind and waves struck the boat. The disciples woke Jesus; he commanded the wind and sea to be still. A great calm followed, and they marvelled at his authority.',
      'ar-EG':
        'هاجت الريح والموج والتلاميذ في المركب. أيقظوا يسوع، فأمر الريح والبحر أن يهدآ. صار هدوء عظيم، وتعجّب التلاميذ من سلطانه.',
      it: 'Vento e onde colpirono la barca. I discepoli svegliarono Gesù; egli ordinò al vento e al mare di calmarsi. Seguì una grande calma, e si stupirono della sua autorità.',
      el: 'Άνεμος και κύματα χτυπούσαν τη βάρκα. Οι μαθητές ξύπνησαν τον Ιησού· εκείνος πρόσταξε τον άνεμο και τη θάλασσα να ησυχάσουν. Ακολούθησε μεγάλη γαλήνη, κι εκείνοι θαύμασαν την εξουσία του.',
      fr: 'Le vent et les vagues secouaient la barque. Les disciples réveillèrent Jésus ; il ordonna au vent et à la mer de se calmer. Un grand calme suivit, et ils s’émerveillèrent de son autorité.',
    },
  },
  {
    contentId: 'church_story_sheep_001',
    reference: 'Luke 15:3–7',
    sourceUrl: 'https://www.bible.com/ar/bible/13/LUK.15.AVD',
    title: {
      en: 'The Sheep Brought Home',
      'ar-EG': 'الخروف اللي رجع',
      it: 'La pecora ritrovata',
      el: 'Το πρόβατο που βρέθηκε',
      fr: 'La brebis retrouvée',
    },
    text: {
      en: 'Jesus told of a shepherd who searched until he found his lost sheep. Carrying it joyfully on his shoulders, he called his friends to celebrate—like heaven’s joy over a repentant sinner.',
      'ar-EG':
        'حكى يسوع عن راعٍ بحث عن خروفه الضائع حتى وجده. حمله على كتفيه فرحانًا، ودعا أصحابه ليفرحوا معه. شبّه هذا الفرح بفرح السماء بخاطئ يتوب.',
      it: 'Gesù raccontò di un pastore che cercò la pecora smarrita finché la ritrovò. La portò sulle spalle, felice, invitando gli amici a festeggiare: così gioisce il cielo per un peccatore pentito.',
      el: 'Ο Ιησούς μίλησε για έναν βοσκό που έψαχνε ώσπου βρήκε το χαμένο πρόβατο. Το σήκωσε χαρούμενος στους ώμους και κάλεσε τους φίλους να χαρούν: έτσι χαίρεται ο ουρανός για έναν αμαρτωλό που μετανοεί.',
      fr: 'Jésus raconta qu’un berger chercha sa brebis perdue jusqu’à la retrouver. Il la porta joyeusement sur ses épaules, invitant ses amis à fêter ce retour : ainsi le ciel se réjouit pour un pécheur repentant.',
    },
  },
  {
    contentId: 'church_story_samaritan_001',
    reference: 'Luke 10:30–37',
    sourceUrl: 'https://www.bible.com/ar/bible/13/LUK.10.AVD',
    title: {
      en: 'The Neighbour Who Showed Mercy',
      'ar-EG': 'القريب اللي رحِم',
      it: 'Il prossimo che ebbe compassione',
      el: 'Ο πλησίον που έδειξε έλεος',
      fr: 'Le prochain miséricordieux',
    },
    text: {
      en: 'Jesus told of a Samaritan who saw an injured traveller. He stopped, dressed his wounds, and took him to an inn for care. He became a neighbour by showing mercy.',
      'ar-EG':
        'حكى يسوع عن سامري رأى مسافرًا مصابًا. توقّف، وضمّد جراحه، وأخذه إلى فندق ليرعاه. صار قريبًا له بالرحمة التي صنعها، لا بمجرد الكلام.',
      it: 'Gesù raccontò di un samaritano che vide un viaggiatore ferito. Si fermò, gli fasciò le ferite e lo portò in una locanda per curarlo. Fu suo prossimo mostrando misericordia.',
      el: 'Ο Ιησούς μίλησε για έναν Σαμαρείτη που είδε έναν τραυματισμένο ταξιδιώτη. Σταμάτησε, έδεσε τις πληγές του και τον πήγε σε πανδοχείο για φροντίδα. Έγινε πλησίον του δείχνοντας έλεος.',
      fr: 'Jésus raconta qu’un Samaritain vit un voyageur blessé. Il s’arrêta, pansa ses plaies et le conduisit dans une auberge pour le soigner. Il fut son prochain en lui montrant de la miséricorde.',
    },
  },
];

export function buildChurchStoryRows(
  proposals: readonly ChurchStoryProposal[] = CHURCH_STORY_PROPOSALS,
): Record<string, string>[] {
  return proposals.flatMap((story) =>
    LOCALES.map((l) => ({
      content_row_id: `${story.contentId}_${l.suffix}`,
      content_id: story.contentId,
      content_type: 'story',
      active_date: '',
      locale: l.locale,
      title: story.title[l.locale],
      text: story.text[l.locale],
      direction: l.direction,
      image_asset_ids: '',
      voiceover_id: '',
      bible_reference: story.reference,
      source_url: story.sourceUrl,
      review_status: 'pending_review',
      enabled: 'FALSE',
    })),
  );
}

export async function seedChurchStoryProposals(
  gateway: SheetGateway,
  proposals: readonly ChurchStoryProposal[] = CHURCH_STORY_PROPOSALS,
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent('30_CHURCH_CONTENT', buildChurchStoryRows(proposals));
}

export async function seedChurchVerseLocaleFill(
  gateway: SheetGateway,
  input: ChurchVersePlanInput,
  scheduleAndStatus: { activeDate: string; reviewStatus: string; enabled: string },
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent(
    '30_CHURCH_CONTENT',
    buildChurchVerseLocaleFillRows(input, scheduleAndStatus),
  );
}
