import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Locale-authored proposals from `assets/Veoulla_Content_Completion_v1/dialogue_5_locales.json`,
 * mapped onto `15_DIALOGUE`'s real columns. The package's own `speaker_role_proposal` field is
 * explicitly documented (its README §"Startable work") as semantic metadata, not a claim about a
 * real `speaker_id` — resolved here instead from the live Sheet: `36_CHARACTERS` has exactly one
 * narrating/companion character (`var`; `marcelino` never speaks first-person in this package, he is
 * only described by VAR), and the two already-live groups (`dlg_gate`, `dlg_naming`) both use
 * `speaker_id: 'var'`. Every new row therefore uses `speaker_id: 'var'` too.
 *
 * `displayMode` is resolved from each beat's real `14_STORY_BEATS.beat_type` (read live
 * 2026-09-22), per the Living Bible / CLAUDE.md §17 rule that VAR's *narration* renders as
 * cinematic text while VAR's *direct dialogue* renders as a speech bubble
 * (`apps/web/src/features/narrative/DialogueText.tsx`: `displayMode === 'speech_bubble'` is the
 * only branch — anything else renders as cinematic text, matching the `MISSING_CUE` fallback's
 * own `'narration'` value). Only two of the 16 missing beats are `beat_type: 'cinematic'`
 * (`beat_01_boot`, `beat_04_gate_open`); every other missing beat is a beat where VAR is
 * addressing Veoulla directly (`dialogue`, `location_intro`, `unlock`, `delivery`, `message`,
 * `completion`), matching the existing live convention (`dlg_gate` is `beat_type: interaction`,
 * `dlg_naming` is `beat_type: choice`, and both already use `speech_bubble`).
 *
 * No voiceover_id is assigned (CLAUDE.md §17: no voice-over, anywhere, ever again — inventing a
 * `vo_*` id here would dangle against a `16_VOICEOVER` row that will never exist).
 *
 * Every row is `enabled: 'FALSE'` — this seed inserts the text; it does not turn any of it on.
 */
export interface DialogueGroupProposal {
  groupId: string;
  beatId: string;
  displayMode: 'narration' | 'speech_bubble';
  /** Church placement note from the package, kept here only as a code comment aid — not written to any cell. */
  text: Readonly<Record<'en' | 'ar-EG' | 'it' | 'el' | 'fr', string>>;
}

const LOCALES = [
  { locale: 'en', suffix: 'en', direction: 'ltr' },
  { locale: 'ar-EG', suffix: 'ar', direction: 'rtl' },
  { locale: 'it', suffix: 'it', direction: 'ltr' },
  { locale: 'el', suffix: 'el', direction: 'ltr' },
  { locale: 'fr', suffix: 'fr', direction: 'ltr' },
] as const;

export const DIALOGUE_GROUP_PROPOSALS: readonly DialogueGroupProposal[] = [
  {
    groupId: 'dlg_boot',
    beatId: 'beat_01_boot',
    displayMode: 'narration',
    text: {
      en: 'Take a quiet breath, Veoulla… and leave the bustle of the day outside for a little while. Your world is waiting.',
      'ar-EG': 'خدي نفس هادي يا فيولا… وسيبي دوشة اليوم برا شوية. عالمك مستنيكي.',
      it: 'Fai un respiro tranquillo, Veoulla… e lascia fuori per un po’ il trambusto della giornata. Il tuo mondo ti aspetta.',
      el: 'Πάρε μια ήρεμη ανάσα, Veoulla… κι άφησε για λίγο έξω τη φασαρία της ημέρας. Ο κόσμος σου σε περιμένει.',
      fr: 'Respire doucement, Veoulla… et laisse un instant l’agitation de la journée dehors. Ton monde t’attend.',
    },
  },
  {
    groupId: 'dlg_var_reveal',
    beatId: 'beat_03_var_reveal',
    displayMode: 'speech_bubble',
    text: {
      en: 'There you are! I’ll be your companion on this little journey. Shall we open the door and see what’s beyond?',
      'ar-EG': 'أهو إنتِ جيتي! هكون رفيقك في اللفة دي. نفتح الباب ونشوف اللي وراه؟',
      it: 'Eccoti! Ti farò compagnia in questo piccolo viaggio. Apriamo la porta e vediamo cosa c’è oltre?',
      el: 'Να ’σαι! Θα σου κρατάω παρέα σ’ αυτή τη μικρή διαδρομή. Ανοίγουμε την πόρτα να δούμε τι υπάρχει πίσω της;',
      fr: 'Te voilà ! Je vais t’accompagner dans cette petite aventure. On ouvre la porte pour voir ce qu’il y a derrière ?',
    },
  },
  {
    groupId: 'dlg_gate_open',
    beatId: 'beat_04_gate_open',
    displayMode: 'narration',
    text: {
      en: 'It’s open! Can you see the light on the other side? Come on… we’ll take our time.',
      'ar-EG': 'اتفتح! شايفة النور اللي جاي من الناحية التانية؟ يلا… نمشي على مهلك.',
      it: 'Si è aperta! Vedi la luce dall’altra parte? Andiamo… senza fretta.',
      el: 'Άνοιξε! Βλέπεις το φως από την άλλη μεριά; Έλα… με την ησυχία μας.',
      fr: 'C’est ouvert ! Tu vois la lumière de l’autre côté ? Viens… on prend notre temps.',
    },
  },
  {
    groupId: 'dlg_beach',
    beatId: 'beat_05_beach',
    displayMode: 'speech_bubble',
    text: {
      en: 'Our first stop: the sea. Take your time with the waves. If you’d like a closer look, the shell on the sand will take you there.',
      'ar-EG':
        'أول وقفة لينا: البحر. خدي وقتك مع الموج، ولو حبيتي نبص عليه أقرب، الصدفة اللي على الرمل هتودّيكي له.',
      it: 'La nostra prima tappa: il mare. Goditi le onde. Se vuoi guardarle più da vicino, tocca la conchiglia sulla sabbia.',
      el: 'Πρώτη μας στάση: η θάλασσα. Χάζεψε τα κύματα όσο θέλεις. Για μια πιο κοντινή ματιά, άγγιξε το κοχύλι στην άμμο.',
      fr: 'Première étape : la mer. Prends le temps de regarder les vagues. Pour les voir de plus près, touche le coquillage sur le sable.',
    },
  },
  {
    groupId: 'dlg_church',
    beatId: 'beat_07_church',
    displayMode: 'speech_bubble',
    text: {
      en: 'Here we are at the church door. Take your time inside: you can light a candle, read a verse, or listen to a hymn. I’ll wait here outside.',
      'ar-EG':
        'وصلنا باب الكنيسة. ادخلي براحتك؛ جوا تقدري تولّعي شمعة، تقري آية، أو تسمعي ترنيمة. أنا هستناكي هنا بره.',
      it: 'Eccoci alla porta della chiesa. Entra pure con calma: puoi accendere una candela, leggere un versetto o ascoltare un inno. Ti aspetto qui fuori.',
      el: 'Φτάσαμε στην πόρτα της εκκλησίας. Μπες με την ησυχία σου: μπορείς να ανάψεις ένα κερί, να διαβάσεις ένα εδάφιο ή να ακούσεις έναν ύμνο. Θα σε περιμένω εδώ έξω.',
      fr: 'Nous voilà à la porte de l’église. Prends ton temps à l’intérieur : tu peux allumer une bougie, lire un verset ou écouter un cantique. Je t’attends ici, dehors.',
    },
  },
  {
    groupId: 'dlg_cafe',
    beatId: 'beat_08_cafe',
    displayMode: 'speech_bubble',
    text: {
      en: 'This is the Vinyl Café. Here, we let each song have its moment. Once you’ve picked something to listen to, we can carry on at your pace.',
      'ar-EG':
        'وده الـVinyl Café. هنا بنسيب الأغنية تاخد وقتها. لما تختاري حاجة تسمعيها، نكمّل اللفة على مزاجك.',
      it: 'Questo è il Vinyl Café. Qui lasciamo a ogni canzone il suo momento. Quando avrai scelto cosa ascoltare, continueremo al tuo ritmo.',
      el: 'Αυτό είναι το Vinyl Café. Εδώ αφήνουμε κάθε τραγούδι να έχει τη στιγμή του. Μόλις διαλέξεις τι θα ακούσεις, συνεχίζουμε με τον ρυθμό σου.',
      fr: 'Voici le Vinyl Café. Ici, on laisse chaque chanson prendre sa place. Quand tu auras choisi quoi écouter, on continuera à ton rythme.',
    },
  },
  {
    groupId: 'dlg_walkman',
    beatId: 'beat_09_walkman',
    displayMode: 'speech_bubble',
    text: {
      en: 'The Walkman is yours now. Open it at the bottom right and choose your music. At the church door, it goes quiet until you return and start it yourself.',
      'ar-EG':
        'الـWalkman بقى معاكي. افتحيه من الركن اللي تحت على اليمين واختاري المزيكا. وعند باب الكنيسة هنسيبه ساكت لحد ما ترجعي وتشغّليه بنفسك.',
      it: 'Ora il Walkman è tuo. Aprilo in basso a destra e scegli la musica. Alla porta della chiesa si ferma, finché non torni e lo riavvii tu.',
      el: 'Το Walkman είναι πια δικό σου. Άνοιξέ το κάτω δεξιά και διάλεξε μουσική. Στην πόρτα της εκκλησίας σταματά, μέχρι να επιστρέψεις και να το ξεκινήσεις εσύ.',
      fr: 'Le Walkman est à toi maintenant. Ouvre-le en bas à droite et choisis ta musique. À la porte de l’église, il se met en pause jusqu’à ton retour et ta prochaine lecture.',
    },
  },
  {
    groupId: 'dlg_arcade',
    beatId: 'beat_10_arcade',
    displayMode: 'speech_bubble',
    text: {
      en: 'How about a game? VARcade has memory, catching and picture puzzles. Try whatever takes your fancy. If the first attempt doesn’t work out, we can try again.',
      'ar-EG':
        'شوية لعب؟ في الـVARcade قدامك ألعاب ذاكرة وسرعة وتركيب صور. جرّبي اللي يعجبك، ولو أول محاولة ما ظبطتش، عادي… نجرّب تاني.',
      it: 'Ti va di giocare? Al VARcade trovi memoria, oggetti da prendere e puzzle di immagini. Prova ciò che ti incuriosisce. Se il primo tentativo va male, riproviamo.',
      el: 'Πάμε για παιχνίδι; Στο VARcade θα βρεις μνήμη, πιάσιμο αντικειμένων και παζλ εικόνων. Δοκίμασε ό,τι σου αρέσει. Αν δεν πετύχει με την πρώτη, ξαναδοκιμάζουμε.',
      fr: 'Une petite partie ? Le VARcade propose mémoire, objets à attraper et puzzles d’images. Essaie ce qui te plaît. Si ça ne marche pas du premier coup, on recommence.',
    },
  },
  {
    groupId: 'dlg_cottage',
    beatId: 'beat_11_cottage',
    displayMode: 'speech_bubble',
    text: {
      en: 'And this is your cottage, Veoulla. A reading corner, shelves for your little treasures, and a mailbox that may hold a surprise. Have a look around at your own pace.',
      'ar-EG':
        'وده بيتك يا فيولا. ركن للقراءة، ورفوف لتفاصيلك الصغيرة، وصندوق بريد يمكن يخبّي لك مفاجأة. بصّي حواليكي على مهلك.',
      it: 'E questa è la tua casetta, Veoulla. Un angolo lettura, mensole per i tuoi piccoli tesori e una cassetta della posta che potrebbe riservarti una sorpresa. Guardati intorno con calma.',
      el: 'Κι αυτό είναι το σπιτάκι σου, Veoulla. Μια γωνιά ανάγνωσης, ράφια για τους μικρούς σου θησαυρούς και ένα γραμματοκιβώτιο που μπορεί να κρύβει έκπληξη. Ρίξε μια ματιά με την ησυχία σου.',
      fr: 'Et voici ta petite maison, Veoulla. Un coin lecture, des étagères pour tes petits trésors et une boîte aux lettres qui cache peut-être une surprise. Regarde autour de toi, tranquillement.',
    },
  },
  {
    groupId: 'dlg_marcelino',
    beatId: 'beat_12_marcelino',
    displayMode: 'speech_bubble',
    text: {
      en: 'When a letter is waiting for you, Marcelino brings it to the mailbox. Let’s see whether anything has arrived today.',
      'ar-EG':
        'لما يكون فيه جواب مستنيكي، مارسيلينو يوصلّه لصندوق البريد. خلّينا نشوف لو فيه حاجة وصلت النهارده.',
      it: 'Quando c’è una lettera per te, Marcelino la porta alla cassetta della posta. Vediamo se oggi è arrivato qualcosa.',
      el: 'Όταν σε περιμένει ένα γράμμα, ο Marcelino το φέρνει στο γραμματοκιβώτιο. Ας δούμε αν έφτασε κάτι σήμερα.',
      fr: 'Quand une lettre t’attend, Marcelino la dépose dans la boîte aux lettres. Voyons si quelque chose est arrivé aujourd’hui.',
    },
  },
  {
    groupId: 'dlg_first_message',
    beatId: 'beat_13_message',
    displayMode: 'speech_bubble',
    text: {
      en: 'There’s a message for you from Ahmed. Open it whenever you like. If it appears in another language, the translation ribbon lets you read it in yours.',
      'ar-EG':
        'فيه رسالة ليكي من أحمد. افتحيها لما تحبي؛ ولو ظهرت بلغة تانية، شريط الترجمة يساعدك تقريها بلغتك.',
      it: 'C’è un messaggio di Ahmed per te. Aprilo quando vuoi. Se appare in un’altra lingua, il nastro di traduzione ti permette di leggerlo nella tua.',
      el: 'Υπάρχει ένα μήνυμα από τον Ahmed για σένα. Άνοιξέ το όποτε θέλεις. Αν εμφανιστεί σε άλλη γλώσσα, η κορδέλα μετάφρασης θα σε βοηθήσει να το διαβάσεις στη δική σου.',
      fr: 'Un message d’Ahmed t’attend. Ouvre-le quand tu veux. S’il apparaît dans une autre langue, le ruban de traduction te permet de le lire dans la tienne.',
    },
  },
  {
    groupId: 'dlg_farm',
    beatId: 'beat_14_farm',
    displayMode: 'speech_bubble',
    text: {
      en: 'Welcome to Sunberry Fields. Pick a seed, plant it, and give it some water. The rest takes time… and lovely things are worth waiting for.',
      'ar-EG':
        'أهلًا بيكي في Sunberry Fields. اختاري بذرة، ازرعيها، واديها شوية مية. الباقي محتاج وقت… والحاجات الحلوة تستاهل نستناها.',
      it: 'Benvenuta a Sunberry Fields. Scegli un seme, piantalo e dagli un po’ d’acqua. Il resto richiede tempo… e le cose belle meritano l’attesa.',
      el: 'Καλώς ήρθες στο Sunberry Fields. Διάλεξε έναν σπόρο, φύτεψέ τον και δώσε του λίγο νερό. Τα υπόλοιπα θέλουν χρόνο… και τα όμορφα πράγματα αξίζουν την αναμονή.',
      fr: 'Bienvenue à Sunberry Fields. Choisis une graine, plante-la et donne-lui un peu d’eau. La suite demande du temps… et les belles choses valent la peine d’attendre.',
    },
  },
  {
    groupId: 'dlg_museum',
    beatId: 'beat_15_museum_approach',
    displayMode: 'speech_bubble',
    text: {
      en: 'See the building up there? That’s The Everkeep. The keys you’ve collected along the way have a part to play here. Shall we see what the door needs?',
      'ar-EG':
        'شايفة المبنى اللي فوق؟ ده The Everkeep. المفاتيح اللي جمعتيها في الطريق ليها دور هنا. نقرّب ونشوف الباب محتاج إيه؟',
      it: 'Vedi quell’edificio lassù? È The Everkeep. Le chiavi raccolte lungo il cammino servono anche qui. Ci avviciniamo per vedere cosa richiede la porta?',
      el: 'Βλέπεις το κτίριο εκεί πάνω; Είναι το The Everkeep. Τα κλειδιά που μάζεψες στη διαδρομή έχουν τον ρόλο τους εδώ. Πλησιάζουμε να δούμε τι χρειάζεται η πόρτα;',
      fr: 'Tu vois le bâtiment là-haut ? C’est The Everkeep. Les clés récoltées en chemin ont un rôle à jouer ici. On s’approche pour voir ce qu’il faut à la porte ?',
    },
  },
  {
    groupId: 'dlg_hall',
    beatId: 'beat_16_hall',
    displayMode: 'speech_bubble',
    text: {
      en: 'We’ve reached the hall. From here, you can explore the wings and exhibits that are open to you. The panel ahead is where your story with the map begins.',
      'ar-EG':
        'وصلنا القاعة. من هنا تقدري تشوفي الأجنحة والمعروضات اللي اتفتحت لك. واللوحة قدامك هي بداية حكايتك مع الخريطة.',
      it: 'Siamo nella sala. Da qui puoi esplorare le ali e gli oggetti esposti che ti sono accessibili. Il pannello davanti a te è l’inizio della tua storia con la mappa.',
      el: 'Φτάσαμε στην αίθουσα. Από εδώ μπορείς να δεις τις πτέρυγες και τα εκθέματα που έχουν ανοίξει για σένα. Στον πίνακα μπροστά σου αρχίζει η ιστορία σου με τον χάρτη.',
      fr: 'Nous voici dans le hall. Tu peux explorer les ailes et les objets exposés qui te sont accessibles. Le panneau devant toi marque le début de ton histoire avec la carte.',
    },
  },
  {
    groupId: 'dlg_map_unlock',
    beatId: 'beat_17_map_unlock',
    displayMode: 'speech_bubble',
    text: {
      en: 'The map is open! Now you can choose a place on the island and return to the places you know without repeating the whole journey.',
      'ar-EG':
        'الخريطة اتفتحت! دلوقتي تقدري تختاري مكانك على الجزيرة وترجعي للأماكن اللي عرفتيها من غير ما تعيدي اللفة كلها.',
      it: 'La mappa è aperta! Ora puoi scegliere un luogo sull’isola e tornare nei posti che conosci senza ripercorrere tutto il viaggio.',
      el: 'Ο χάρτης άνοιξε! Τώρα μπορείς να διαλέγεις ένα μέρος στο νησί και να επιστρέφεις εκεί που έχεις ήδη πάει, χωρίς να επαναλαμβάνεις όλη τη διαδρομή.',
      fr: 'La carte est ouverte ! Tu peux maintenant choisir un endroit sur l’île et retrouver les lieux que tu connais sans refaire tout le parcours.',
    },
  },
  {
    groupId: 'dlg_freedom',
    beatId: 'beat_18_complete',
    displayMode: 'speech_bubble',
    text: {
      en: 'That’s our first journey complete… and the rest is up to you. The sea, a song, a growing plant, or a quiet moment at home. Each time you return, choose what feels right, Veoulla.',
      'ar-EG':
        'خلصت أول لفة… والباقي على مزاجك. بحر، أغنية، زرعة، أو قعدة هادية في البيت. كل مرة ترجعي، اختاري اللي يريحك يا فيولا.',
      it: 'Il nostro primo giro è finito… e il resto lo scegli tu. Il mare, una canzone, una piantina o un momento tranquillo a casa. Ogni volta che torni, scegli ciò che ti fa stare bene, Veoulla.',
      el: 'Η πρώτη μας διαδρομή τελείωσε… και τα υπόλοιπα τα διαλέγεις εσύ. Θάλασσα, ένα τραγούδι, ένα φυτό ή λίγη ησυχία στο σπίτι. Κάθε φορά που επιστρέφεις, διάλεξε ό,τι σου κάνει καλό, Veoulla.',
      fr: 'Notre première promenade est terminée… et la suite t’appartient. La mer, une chanson, une plante qui pousse ou un moment tranquille à la maison. À chaque retour, choisis ce qui te fait du bien, Veoulla.',
    },
  },
];

/** Groups this package explicitly forbids touching — already-approved, already-live content. */
export const PRESERVE_EXISTING_GROUP_IDS = ['dlg_gate', 'dlg_naming'] as const;

export function buildDialogueGroupRows(
  proposals: readonly DialogueGroupProposal[] = DIALOGUE_GROUP_PROPOSALS,
): Record<string, string>[] {
  return proposals.flatMap((proposal) => {
    if ((PRESERVE_EXISTING_GROUP_IDS as readonly string[]).includes(proposal.groupId)) {
      throw new Error(`Refusing to seed over an already-live group: ${proposal.groupId}`);
    }
    const dialogueId = `${proposal.groupId}_01`;
    return LOCALES.map((l) => ({
      dialogue_row_id: `${dialogueId}_${l.suffix}`,
      dialogue_id: dialogueId,
      group_id: proposal.groupId,
      sequence: '1',
      speaker_id: 'var',
      locale: l.locale,
      text: proposal.text[l.locale],
      direction: l.direction,
      emotion: '',
      display_mode: proposal.displayMode,
      voiceover_id: '',
      requires_response: 'FALSE',
      response_type: 'none',
      next_dialogue_id: '',
      enabled: 'FALSE',
    }));
  });
}

/**
 * Idempotent and append-only: an existing `dialogue_row_id` (including the live `dlg_gate`/
 * `dlg_naming` rows, which this proposal set never targets) is never touched. Every appended row
 * is `enabled: 'FALSE'` — content is inserted, not switched on.
 */
export async function seedDialogueGroupProposals(
  gateway: SheetGateway,
  proposals: readonly DialogueGroupProposal[] = DIALOGUE_GROUP_PROPOSALS,
): Promise<{ created: string[]; existing: string[] }> {
  return gateway.appendRowsIfAbsent('15_DIALOGUE', buildDialogueGroupRows(proposals));
}
