import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Starter content for the two new island-completion subsystems:
 *
 * - `42_ARCADE_TRIVIA`: a small, non-personal, general/world-lore question
 *   bank (island keys/locations facts already established elsewhere in the
 *   Sheet — nothing about Ahmed/Veoulla, no memories). Seeded `enabled:
 *   'TRUE'` (Ahmed's choice — the cabinet goes live now) but `review_status:
 *   'pending_review'`, so it is clearly flagged in the Sheet as a draft
 *   starter set for him to review/replace, distinct from the Church's own
 *   `31_CHURCH_QUIZ` bank (never reused).
 * - `43_COMPANION_HINTS`: neutral, operational location-help lines (not deep
 *   personal VAR narrative), tied to real `14_STORY_BEATS` ids read live
 *   2026-09-23, so a hint can never reference a beat that isn't actually the
 *   next eligible action.
 */

const LOCALE_SUFFIX: Record<string, string> = {
  en: 'en',
  'ar-EG': 'ar',
  it: 'it',
  el: 'el',
  fr: 'fr',
};

interface TriviaSource {
  questionId: string;
  questionType: 'multiple_choice' | 'true_false';
  correctAnswer: string;
  byLocale: Record<
    string,
    { question: string; options?: [string, string, string, string]; explanation: string }
  >;
}

const TRIVIA_QUESTIONS: TriviaSource[] = [
  {
    questionId: 'triv_farm_key',
    questionType: 'multiple_choice',
    correctAnswer: 'a',
    byLocale: {
      en: {
        question: 'Which shape is the Farm key?',
        options: ['A sunflower', 'A candle', 'A seashell', 'An envelope'],
        explanation: 'The Farm key is sunflower-shaped.',
      },
      'ar-EG': {
        question: 'مفتاح المزرعة شكله إيه؟',
        options: ['زهرة عباد شمس', 'شمعة', 'صدفة', 'ظرف جواب'],
        explanation: 'مفتاح المزرعة شكله زهرة عباد الشمس.',
      },
      it: {
        question: 'Che forma ha la chiave della Fattoria?',
        options: ['Un girasole', 'Una candela', 'Una conchiglia', 'Una busta'],
        explanation: 'La chiave della Fattoria ha la forma di un girasole.',
      },
      el: {
        question: 'Τι σχήμα έχει το κλειδί της Φάρμας;',
        options: ['Ένα ηλιοτρόπιο', 'Ένα κερί', 'Ένα κοχύλι', 'Έναν φάκελο'],
        explanation: 'Το κλειδί της Φάρμας έχει σχήμα ηλιοτροπίου.',
      },
      fr: {
        question: 'Quelle est la forme de la clé de la Ferme ?',
        options: ['Un tournesol', 'Une bougie', 'Un coquillage', 'Une enveloppe'],
        explanation: 'La clé de la Ferme a la forme d’un tournesol.',
      },
    },
  },
  {
    questionId: 'triv_arcade_key',
    questionType: 'multiple_choice',
    correctAnswer: 'a',
    byLocale: {
      en: {
        question: 'Which shape is the VARcade key?',
        options: ['A retro coin/token', 'A candle', 'A seashell', 'A music note'],
        explanation: 'The Arcade key is a retro arcade token/coin.',
      },
      'ar-EG': {
        question: 'مفتاح الـ VARcade شكله إيه؟',
        options: ['عملة/توكن قديم', 'شمعة', 'صدفة', 'نوتة موسيقى'],
        explanation: 'مفتاح الأركيد شكله عملة أركيد قديمة.',
      },
      it: {
        question: 'Che forma ha la chiave del VARcade?',
        options: ['Un gettone retrò', 'Una candela', 'Una conchiglia', 'Una nota musicale'],
        explanation: 'La chiave dell’Arcade è un gettone/moneta retrò.',
      },
      el: {
        question: 'Τι σχήμα έχει το κλειδί του VARcade;',
        options: ['Ένα ρετρό κέρμα', 'Ένα κερί', 'Ένα κοχύλι', 'Μια νότα μουσικής'],
        explanation: 'Το κλειδί της Αρκάδας είναι ένα ρετρό κέρμα/τόκεν.',
      },
      fr: {
        question: 'Quelle est la forme de la clé du VARcade ?',
        options: ['Un jeton rétro', 'Une bougie', 'Un coquillage', 'Une note de musique'],
        explanation: 'La clé de l’Arcade est un jeton/pièce rétro.',
      },
    },
  },
  {
    questionId: 'triv_cafe_key_tf',
    questionType: 'true_false',
    correctAnswer: 'true',
    byLocale: {
      en: {
        question: 'True or false: the Vinyl Café key is shaped like a music note.',
        explanation: 'True — the Café key is a music note.',
      },
      'ar-EG': {
        question: 'صح ولا غلط: مفتاح الـ Vinyl Café شكله نوتة موسيقى.',
        explanation: 'صح — مفتاح الكافيه شكله نوتة موسيقى.',
      },
      it: {
        question: 'Vero o falso: la chiave del Vinyl Café ha la forma di una nota musicale.',
        explanation: 'Vero — la chiave del Café è una nota musicale.',
      },
      el: {
        question: 'Σωστό ή λάθος: το κλειδί του Vinyl Café έχει σχήμα νότας μουσικής.',
        explanation: 'Σωστό — το κλειδί του Café είναι μια νότα μουσικής.',
      },
      fr: {
        question: 'Vrai ou faux : la clé du Vinyl Café a la forme d’une note de musique.',
        explanation: 'Vrai — la clé du Café est une note de musique.',
      },
    },
  },
  {
    questionId: 'triv_everkeep_name',
    questionType: 'multiple_choice',
    correctAnswer: 'a',
    byLocale: {
      en: {
        question: 'What is the Museum officially called?',
        options: ['The Everkeep', 'The Archive', 'The Gallery', 'The Library'],
        explanation: 'The Museum’s official name is The Everkeep.',
      },
      'ar-EG': {
        question: 'إيه الاسم الرسمي للمتحف؟',
        options: ['The Everkeep', 'الأرشيف', 'الجاليري', 'المكتبة'],
        explanation: 'الاسم الرسمي للمتحف هو The Everkeep.',
      },
      it: {
        question: 'Come si chiama ufficialmente il Museo?',
        options: ['The Everkeep', 'L’Archivio', 'La Galleria', 'La Biblioteca'],
        explanation: 'Il nome ufficiale del Museo è The Everkeep.',
      },
      el: {
        question: 'Πώς λέγεται επίσημα το Μουσείο;',
        options: ['The Everkeep', 'Το Αρχείο', 'Η Γκαλερί', 'Η Βιβλιοθήκη'],
        explanation: 'Το επίσημο όνομα του Μουσείου είναι The Everkeep.',
      },
      fr: {
        question: 'Comment s’appelle officiellement le Musée ?',
        options: ['The Everkeep', 'Les Archives', 'La Galerie', 'La Bibliothèque'],
        explanation: 'Le nom officiel du Musée est The Everkeep.',
      },
    },
  },
  {
    questionId: 'triv_varcade_cabinets_tf',
    questionType: 'true_false',
    correctAnswer: 'true',
    byLocale: {
      en: {
        question: 'True or false: VARcade grows to five machines in total.',
        explanation: 'True — VARcade launches with three machines and grows to five.',
      },
      'ar-EG': {
        question: 'صح ولا غلط: الـ VARcade بيوصل لخمس ماكينات في الآخر.',
        explanation: 'صح — الأركيد بيبدأ بتلات ماكينات وبيوصل لخمسة.',
      },
      it: {
        question: 'Vero o falso: il VARcade arriva ad avere cinque macchine in totale.',
        explanation: 'Vero — il VARcade parte con tre macchine e arriva a cinque.',
      },
      el: {
        question: 'Σωστό ή λάθος: το VARcade φτάνει συνολικά τα πέντε μηχανήματα.',
        explanation: 'Σωστό — το VARcade ξεκινά με τρία μηχανήματα και φτάνει τα πέντε.',
      },
      fr: {
        question: 'Vrai ou faux : le VARcade atteint cinq bornes au total.',
        explanation: 'Vrai — le VARcade démarre avec trois bornes et en compte cinq à terme.',
      },
    },
  },
];

export function buildArcadeTriviaRows(): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const q of TRIVIA_QUESTIONS) {
    for (const [locale, suffix] of Object.entries(LOCALE_SUFFIX)) {
      const l = q.byLocale[locale];
      if (!l) continue;
      const [a, b, c, d] = l.options ?? ['', '', '', ''];
      rows.push({
        question_row_id: `${q.questionId}_${suffix}`,
        question_id: q.questionId,
        locale,
        question: l.question,
        question_type: q.questionType,
        option_a: a,
        option_b: b,
        option_c: c,
        option_d: d,
        correct_answer: q.correctAnswer,
        explanation: l.explanation,
        enabled: 'TRUE',
        review_status: 'pending_review',
      });
    }
  }
  return rows;
}

export async function seedArcadeTriviaQuestions(gateway: SheetGateway) {
  return gateway.appendRowsIfAbsent('42_ARCADE_TRIVIA', buildArcadeTriviaRows());
}

interface HintSource {
  hintId: string;
  locationId: string;
  conditionType: 'always' | 'story_beat_pending';
  conditionValue: string;
  priority: number;
  byLocale: Record<string, string>;
}

const HINTS: HintSource[] = [
  {
    hintId: 'hint_arcade_intro',
    locationId: 'arcade',
    conditionType: 'story_beat_pending',
    conditionValue: 'beat_10_arcade',
    priority: 1,
    byLocale: {
      en: 'Try the first machine — it just needs one win.',
      'ar-EG': 'جربي الماكينة الأولى — كل اللي محتاجاه انتصار واحد.',
      it: 'Prova la prima macchina: ti basta una vittoria.',
      el: 'Δοκίμασε το πρώτο μηχάνημα — αρκεί μια νίκη.',
      fr: 'Essaie la première borne — une seule victoire suffit.',
    },
  },
  {
    hintId: 'hint_arcade_always',
    locationId: 'arcade',
    conditionType: 'always',
    conditionValue: '',
    priority: 5,
    byLocale: {
      en: 'More machines unlock as you collect keys.',
      'ar-EG': 'ماكينات أكتر هتفتح كل ما تجمعي مفاتيح.',
      it: 'Altre macchine si sbloccano man mano che raccogli chiavi.',
      el: 'Περισσότερα μηχανήματα ξεκλειδώνουν όσο μαζεύεις κλειδιά.',
      fr: 'D’autres bornes se débloquent au fil des clés que tu récoltes.',
    },
  },
  {
    hintId: 'hint_cafe_intro',
    locationId: 'cafe',
    conditionType: 'story_beat_pending',
    conditionValue: 'beat_08_cafe',
    priority: 1,
    byLocale: {
      en: 'Open the gramophone to see what plays.',
      'ar-EG': 'افتحي الجرامافون عشان تشوفي هيشغل إيه.',
      it: 'Apri il grammofono per scoprire cosa suona.',
      el: 'Άνοιξε το γραμμόφωνο για να δεις τι παίζει.',
      fr: 'Ouvre le gramophone pour voir ce qu’il joue.',
    },
  },
  {
    hintId: 'hint_cafe_always',
    locationId: 'cafe',
    conditionType: 'always',
    conditionValue: '',
    priority: 5,
    byLocale: {
      en: 'New songs sometimes appear at the Café.',
      'ar-EG': 'أحيانًا بتظهر أغاني جديدة في الكافيه.',
      it: 'A volte al Café compaiono nuove canzoni.',
      el: 'Μερικές φορές εμφανίζονται νέα τραγούδια στο Café.',
      fr: 'De nouvelles chansons apparaissent parfois au Café.',
    },
  },
  {
    hintId: 'hint_farm_plant',
    locationId: 'farm',
    conditionType: 'story_beat_pending',
    conditionValue: 'beat_14_farm',
    priority: 1,
    byLocale: {
      en: 'Try planting a seed, then give it some water.',
      'ar-EG': 'جربي تزرعي بذرة وبعدين اسقيها.',
      it: 'Prova a piantare un seme, poi innaffialo.',
      el: 'Δοκίμασε να φυτέψεις έναν σπόρο και μετά πότισέ τον.',
      fr: 'Essaie de planter une graine, puis arrose-la.',
    },
  },
  {
    hintId: 'hint_farm_always',
    locationId: 'farm',
    conditionType: 'always',
    conditionValue: '',
    priority: 5,
    byLocale: {
      en: 'Crops grow over real time — check back later.',
      'ar-EG': 'المحاصيل بتكبر مع الوقت الحقيقي — ارجعي شوفيها بعدين.',
      it: 'I raccolti crescono nel tempo reale: ripassa più tardi.',
      el: 'Οι καλλιέργειες μεγαλώνουν σε πραγματικό χρόνο — πέρνα ξανά αργότερα.',
      fr: 'Les récoltes poussent en temps réel — reviens plus tard.',
    },
  },
  {
    hintId: 'hint_cottage_deliver',
    locationId: 'cottage',
    conditionType: 'story_beat_pending',
    conditionValue: 'beat_12_marcelino',
    priority: 1,
    byLocale: {
      en: 'Someone may be waiting at the mailbox.',
      'ar-EG': 'يمكن حد مستني عند صندوق البريد.',
      it: 'Forse qualcuno ti aspetta alla cassetta della posta.',
      el: 'Ίσως κάποιος σε περιμένει στο γραμματοκιβώτιο.',
      fr: 'Quelqu’un t’attend peut-être à la boîte aux lettres.',
    },
  },
  {
    hintId: 'hint_cottage_open',
    locationId: 'cottage',
    conditionType: 'story_beat_pending',
    conditionValue: 'beat_13_message',
    priority: 1,
    byLocale: {
      en: 'A message just arrived — open it when you are ready.',
      'ar-EG': 'وصلت رسالة جديدة — افتحيها لما تكوني جاهزة.',
      it: 'È appena arrivato un messaggio: aprilo quando sei pronta.',
      el: 'Μόλις έφτασε ένα μήνυμα — άνοιξέ το όποτε είσαι έτοιμη.',
      fr: 'Un message vient d’arriver — ouvre-le quand tu es prête.',
    },
  },
  {
    hintId: 'hint_cottage_always',
    locationId: 'cottage',
    conditionType: 'always',
    conditionValue: '',
    priority: 5,
    byLocale: {
      en: 'The mailbox is worth checking now and then.',
      'ar-EG': 'يستاهل تتفقدي صندوق البريد بين الحين والتاني.',
      it: 'Vale la pena controllare ogni tanto la cassetta della posta.',
      el: 'Αξίζει να ελέγχεις το γραμματοκιβώτιο κάθε τόσο.',
      fr: 'La boîte aux lettres mérite d’être vérifiée de temps en temps.',
    },
  },
  {
    hintId: 'hint_museum_approach',
    locationId: 'museum',
    conditionType: 'story_beat_pending',
    conditionValue: 'beat_15_museum_approach',
    priority: 1,
    byLocale: {
      en: 'Bring your collected keys to the gate and try the road puzzle.',
      'ar-EG': 'هاتي المفاتيح اللي جمعتيها للبوابة وجربي لغز الطريق.',
      it: 'Porta le chiavi raccolte al cancello e prova l’enigma del sentiero.',
      el: 'Φέρε τα κλειδιά που μάζεψες στην πύλη και δοκίμασε τον γρίφο του δρόμου.',
      fr: 'Apporte tes clés au portail et tente l’énigme du chemin.',
    },
  },
  {
    hintId: 'hint_museum_hall',
    locationId: 'museum',
    conditionType: 'story_beat_pending',
    conditionValue: 'beat_16_hall',
    priority: 1,
    byLocale: {
      en: 'Something in the hall is waiting to be looked at.',
      'ar-EG': 'فيه حاجة في القاعة مستنياكي تبصيلها.',
      it: 'Qualcosa nella sala aspetta di essere osservato.',
      el: 'Κάτι στην αίθουσα περιμένει να το κοιτάξεις.',
      fr: 'Quelque chose dans la salle attend d’être regardé.',
    },
  },
  {
    hintId: 'hint_museum_always',
    locationId: 'museum',
    conditionType: 'always',
    conditionValue: '',
    priority: 5,
    byLocale: {
      en: 'Gallery wings open as more keys, dates, and achievements come together.',
      'ar-EG': 'أجنحة المعرض بتفتح كل ما مفاتيح وتواريخ وإنجازات أكتر تتجمع.',
      it: 'Le ali della galleria si aprono man mano che si uniscono più chiavi, date e traguardi.',
      el: 'Οι πτέρυγες της γκαλερί ανοίγουν καθώς συγκεντρώνονται περισσότερα κλειδιά, ημερομηνίες και επιτεύγματα.',
      fr: 'Les ailes de la galerie s’ouvrent au fil des clés, des dates et des succès réunis.',
    },
  },
];

export function buildCompanionHintRows(): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const h of HINTS) {
    for (const [locale, suffix] of Object.entries(LOCALE_SUFFIX)) {
      const text = h.byLocale[locale];
      if (!text) continue;
      rows.push({
        hint_row_id: `${h.hintId}_${suffix}`,
        hint_id: h.hintId,
        location_id: h.locationId,
        condition_type: h.conditionType,
        condition_value: h.conditionValue,
        priority: String(h.priority),
        locale,
        text,
        direction: locale === 'ar-EG' ? 'rtl' : 'ltr',
        enabled: 'TRUE',
      });
    }
  }
  return rows;
}

export async function seedCompanionHints(gateway: SheetGateway) {
  return gateway.appendRowsIfAbsent('43_COMPANION_HINTS', buildCompanionHintRows());
}
