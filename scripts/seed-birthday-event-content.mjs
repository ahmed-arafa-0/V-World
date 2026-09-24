#!/usr/bin/env node
/**
 * birthday_2026 (M16 narrow scope, Ahmed's 2026-09-24 authorization — CLAUDE.md rule 18):
 *
 *  1. Fixes 17_EVENTS.birthday_2026's target_at/start_at/end_at to the approved window
 *     (26 Sept 2026 00:00 -> 28 Sept 2026 00:00, Africa/Cairo == 2026-09-25T21:00:00.000Z ->
 *     2026-09-27T21:00:00.000Z UTC). Only these three cells are ever patched; every other cell in
 *     the row (including notes/force_flag_id/story_route_id) is left untouched by
 *     `updateByPrimaryKey`, which never writes columns outside the given patch.
 *  2. Appends the 5 approved birthday-letter locale rows to 19_MESSAGES (message_id=msg_birthday_2026).
 *     Idempotent append — never touches the unrelated, pre-existing msg_bday_ahmed placeholder rows.
 *  3. Appends the birthday_2026_celebrated achievement row to 23_ACHIEVEMENTS, reusing the icon
 *     already registered by `npm run seed:birthday:art` (birthday_2026_celebrated_icon).
 *  4. Appends the birthday-specific 08_UI_TEXT rows (30 UI ids + 2 achievement text ids, x5 locales).
 *
 * Every append uses `appendRowsIfAbsent`/`appendIfAbsent` (never duplicates on rerun); the event-date
 * patch checks current values first and is skipped entirely once they already match (a true zero-write
 * rerun). Default mode is PREVIEW ONLY — pass --apply to actually write.
 */
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { TARGET_AT } from './review-support/birthday-dates.mjs';
import { patchBirthdayDates } from './review-support/patch-birthday-dates.mjs';

const APPLY = process.argv.includes('--apply');
const client = createGoogleSheetsClientOrNull();
const gateway = new SheetGateway(client, { ttlSeconds: 0 });

// ---------------------------------------------------------------------------
// 2. Approved birthday letter (5 locales) — APPROVED text below is verbatim from Ahmed's request.
// ---------------------------------------------------------------------------
const LETTER = {
  'ar-EG': {
    direction: 'rtl',
    text: `كل سنة وإنتِ طيبة يا بروفسيرة دكتورة بشمهندسة الآنسة الجميلة فيولا 🤍🌻

طبعًا بعد كل الألقاب دي، مينفعش عيد ميلادك يعدّي بتهنئة وخلاص 😂💜
فقلت نعملك احتفال في عالمك، بتورتة على ذوقك، وبحر قريب منك، وورد بتحبيه… ومفيش حد هيستعجلك تطفي الشمع!

بجد يا فيولا، أنا مبسوط إننا اتعرفنا وبقينا أصحاب، وإنك بقيتي قريبة مني زي أختي. بحب كلامنا وضحكنا، وحتى التفاصيل العادية اللي يمكن بتعدّي من غير ما ناخد بالنا منها، ليها عندي مكان.

بتمنالك في سنتك الجديدة راحة بال، وصحة، وناس تقدّرك وتفرحلك. وإن الحاجات اللي بتتمنيها تبتدي تاخد شكل قدامك، خطوة خطوة، وتفرحي بنفسك وبكل حاجة وصلتي لها، حتى الحاجات اللي شايفاها صغيرة.

ومش لازم كل يوم تبقي قوية أو عندك إجابة لكل حاجة. خدي وقتك، واعملي اللي بتحبيه، وافتكري إن عندك صاحب تقدري تكلميه؛ تحكي، تشتكي، أو حتى تبعتي أي كلام ونضحك عليه سوا 🤍

حبيت أعملك المكان ده علشان يبقى ليكي حاجة مخصوص، ترجعي لها وقت ما تحبي. وحتى لو يوم عيد الميلاد خلص، الاحتفال هنا مستنيكي… نعيد العدّ التنازلي، ونولّع الشمع، ونفرح بيكي من أول وجديد.

يلا بقى، خدي لحظة واتمني أمنية ليكي إنتِ… ومش لازم تقوليها لحد ✨

كل سنة وإنتِ غالية يا فيولا، وكل سنة وفيه أسباب أكتر تضحكي من قلبك 💜

— عرفة`,
  },
  en: {
    direction: 'ltr',
    text: `Happy birthday, Professor Doctor Engineer, the lovely Miss Veoulla 🤍🌻

Of course, after all those titles, your birthday can't just pass with a quick "happy birthday" and that's it 😂💜
So I thought I'd throw you a celebration in your own world — a cake just the way you like it, a sea close by, and flowers you love… and no one will rush you to blow out the candles!

Honestly, Veoulla, I'm so glad we met and became friends, and that you've become close to me like a sister. I love our conversations and our laughter, and even the ordinary little details that might pass by unnoticed have a place with me.

I wish you peace of mind in your new year, good health, and people who appreciate you and bring you joy. May the things you wish for start taking shape in front of you, step by step, and may you be happy with yourself and with everything you've achieved, even the things you see as small.

And you don't have to be strong every day or have an answer for everything. Take your time, do what you love, and remember you have a friend you can talk to — to share, to vent, or even to send any random thought and laugh about it together 🤍

I wanted to make this place for you so it could be something of your own, that you can come back to whenever you like. And even once the birthday itself is over, the celebration will still be waiting for you here… we'll restart the countdown, light the candles again, and celebrate you all over again.

So go on, take a moment and make a wish just for yourself… and you don't have to tell anyone ✨

Happy birthday, dear Veoulla, and every year may there be more reasons to make you laugh from your heart 💜

— Arafa`,
  },
  it: {
    direction: 'ltr',
    text: `Buon compleanno, Professoressa Dottoressa Ingegnera, la bella signorina Veoulla 🤍🌻

Ovviamente, dopo tutti questi titoli, il tuo compleanno non può passare con un semplice augurio e basta 😂💜
Così ho pensato di organizzarti una festa nel tuo mondo, con una torta di tuo gusto, un mare vicino a te, e fiori che ami… e nessuno ti farà fretta di spegnere le candeline!

Sul serio, Veoulla, sono felice di esserci conosciuti e diventati amici, e che tu sia diventata vicina a me come una sorella. Amo le nostre chiacchierate e le nostre risate, e perfino i piccoli dettagli quotidiani che magari passano inosservati hanno un posto per me.

Ti auguro nel tuo nuovo anno serenità, salute, e persone che ti apprezzino e ti facciano felice. Che le cose che desideri comincino a prendere forma davanti a te, passo dopo passo, e che tu sia felice di te stessa e di tutto ciò che hai raggiunto, anche le cose che ti sembrano piccole.

E non devi essere forte ogni giorno o avere una risposta per tutto. Prenditi il tuo tempo, fai ciò che ami, e ricorda che hai un amico con cui parlare; raccontare, sfogarti, o anche solo mandare un pensiero a caso e riderci sopra insieme 🤍

Ho voluto crearti questo posto perché fosse qualcosa di speciale solo per te, a cui tornare ogni volta che vuoi. E anche quando il giorno del compleanno sarà finito, la festa qui ti aspetterà… rifaremo il conto alla rovescia, riaccenderemo le candeline, e festeggeremo di nuovo da capo.

Dai, prenditi un momento ed esprimi un desiderio tutto tuo… e non devi dirlo a nessuno ✨

Buon compleanno, cara Veoulla, e che ogni anno ci siano sempre più motivi per farti ridere di cuore 💜

— Arafa`,
  },
  el: {
    direction: 'ltr',
    text: `Χρόνια πολλά, Καθηγήτρια Δόκτωρ Μηχανικέ, όμορφη δεσποινίς Βεούλα 🤍🌻

Φυσικά, μετά από όλους αυτούς τους τίτλους, τα γενέθλιά σου δεν μπορούν να περάσουν μόνο με μια ευχή και τίποτα άλλο 😂💜
Γι' αυτό σκέφτηκα να σου φτιάξω μια γιορτή στον δικό σου κόσμο, με τούρτα της αρεσκείας σου, θάλασσα κοντά σου, και λουλούδια που αγαπάς… και κανείς δεν θα σε βιάσει να σβήσεις τα κεριά!

Ειλικρινά, Βεούλα, χαίρομαι που γνωριστήκαμε και γίναμε φίλοι, και που έγινες κοντά μου σαν αδερφή. Αγαπώ τις κουβέντες και τα γέλια μας, και ακόμα και οι απλές λεπτομέρειες που ίσως περνούν απαρατήρητες έχουν μια θέση σε μένα.

Σου εύχομαι στον νέο σου χρόνο ηρεμία, υγεία, και ανθρώπους που σε εκτιμούν και σε χαροποιούν. Και τα πράγματα που εύχεσαι να αρχίσουν να παίρνουν μορφή μπροστά σου, βήμα βήμα, και να χαίρεσαι τον εαυτό σου και όλα όσα έχεις καταφέρει, ακόμα κι αυτά που θεωρείς μικρά.

Και δεν χρειάζεται να είσαι δυνατή κάθε μέρα ή να έχεις απάντηση για όλα. Πάρε τον χρόνο σου, κάνε αυτό που αγαπάς, και θυμήσου ότι έχεις έναν φίλο να μιλήσεις· να μοιραστείς, να παραπονεθείς, ή ακόμα και να στείλεις μια τυχαία σκέψη και να γελάσουμε μαζί γι' αυτήν 🤍

Ήθελα να σου φτιάξω αυτό το μέρος για να είναι κάτι δικό σου, να επιστρέφεις όποτε θέλεις. Και ακόμα κι όταν η μέρα των γενεθλίων τελειώσει, η γιορτή εδώ θα σε περιμένει… θα ξαναρχίσουμε την αντίστροφη μέτρηση, θα ξανανάψουμε τα κεριά, και θα γιορτάσουμε ξανά από την αρχή.

Έλα λοιπόν, πάρε μια στιγμή και κάνε μια ευχή μόνο για σένα… και δεν χρειάζεται να την πεις σε κανέναν ✨

Χρόνια πολλά, αγαπημένη Βεούλα, και κάθε χρόνο να υπάρχουν όλο και περισσότεροι λόγοι να γελάς με όλη σου την καρδιά 💜

— Arafa`,
  },
  fr: {
    direction: 'ltr',
    text: `Joyeux anniversaire, Professeure Docteure Ingénieure, la charmante Mademoiselle Veoulla 🤍🌻

Bien sûr, après tous ces titres, ton anniversaire ne peut pas simplement passer avec un souhait et puis c'est tout 😂💜
Alors j'ai pensé t'organiser une fête dans ton propre monde, avec un gâteau à ton goût, une mer tout près de toi, et des fleurs que tu aimes… et personne ne te pressera de souffler les bougies !

Sincèrement, Veoulla, je suis heureux qu'on se soit rencontrés et devenus amis, et que tu sois devenue proche de moi comme une sœur. J'aime nos conversations et nos rires, et même les petits détails ordinaires qui passent peut-être inaperçus ont une place chez moi.

Je te souhaite pour ta nouvelle année la tranquillité d'esprit, la santé, et des gens qui t'apprécient et te rendent heureuse. Que les choses que tu souhaites commencent à prendre forme devant toi, pas à pas, et que tu sois fière de toi-même et de tout ce que tu as accompli, même ce qui te semble petit.

Et tu n'as pas besoin d'être forte tous les jours ni d'avoir une réponse à tout. Prends ton temps, fais ce que tu aimes, et souviens-toi que tu as un ami à qui parler ; pour raconter, te confier, ou même envoyer une pensée random et en rire ensemble 🤍

J'ai voulu te créer cet endroit pour qu'il soit quelque chose à toi, où revenir quand tu veux. Et même quand le jour de l'anniversaire sera passé, la fête t'attendra ici… on relancera le compte à rebours, on rallumera les bougies, et on célébrera à nouveau depuis le début.

Allez, prends un instant et fais un vœu rien que pour toi… et tu n'as pas besoin de le dire à personne ✨

Joyeux anniversaire, chère Veoulla, et que chaque année t'apporte encore plus de raisons de rire de tout ton cœur 💜

— Arafa`,
  },
};

/** Matches the live Sheet's established row-id convention (`_ar`, not `_ar-EG`). */
function rowSuffix(locale) {
  return locale === 'ar-EG' ? 'ar' : locale;
}

function buildLetterRows() {
  return Object.entries(LETTER).map(([locale, { direction, text }]) => ({
    message_row_id: `msg_birthday_2026_${rowSuffix(locale)}`,
    message_id: 'msg_birthday_2026',
    sender_id: 'admin_ahmed',
    recipient_user_id: 'veoulla',
    delivery_at: TARGET_AT,
    priority: '1',
    message_type: 'birthday_letter',
    locale,
    text,
    direction,
    image_asset_ids: '',
    voiceover_id: '', // no voice-over anywhere (CLAUDE.md rule 17)
    gift_ids: 'birthday_2026_celebrated,birthday_cottage_decoration',
    translation_group_id: 'tg_msg_birthday_2026',
    archive_after_open: 'FALSE',
    enabled: 'TRUE',
    notes:
      'Approved by Ahmed 2026-09-24; ar-EG is the authored source, others are faithful translations.',
  }));
}

// ---------------------------------------------------------------------------
// 3. Achievement
// ---------------------------------------------------------------------------
function buildAchievementRow() {
  return {
    achievement_id: 'birthday_2026_celebrated',
    category: 'birthday',
    title_text_id: 'ach_birthday_2026_title',
    description_text_id: 'ach_birthday_2026_desc',
    icon_id: 'birthday_2026_celebrated_icon',
    secret: 'TRUE',
    points: '50',
    trigger_type: 'custom',
    trigger_rule_json: '{}',
    reward_key_type_id: '',
    reward_quantity: '0',
    enabled: 'TRUE',
  };
}

// ---------------------------------------------------------------------------
// 4. UI text (30 birthday_* ids + 2 achievement text ids), 5 locales each
// ---------------------------------------------------------------------------
const DIRECTIONS = { en: 'ltr', 'ar-EG': 'rtl', it: 'ltr', el: 'ltr', fr: 'ltr' };

const UI_TEXT = {
  birthday_celebrate_now: {
    en: 'Celebrate now',
    'ar-EG': 'نحتفل دلوقتي',
    it: 'Festeggia ora',
    el: 'Γιόρτασε τώρα',
    fr: 'Célébrer maintenant',
  },
  birthday_complete: {
    en: "That's it for now — but the celebration is always here waiting for you.",
    'ar-EG': 'خلاص كده دلوقتي… بس الاحتفال هنا يستناكي في أي وقت.',
    it: 'Per ora è tutto — ma la festa è sempre qui ad aspettarti.',
    el: 'Αυτό είναι προς το παρόν — αλλά η γιορτή σε περιμένει πάντα εδώ.',
    fr: "C'est tout pour l'instant — mais la fête t'attend toujours ici.",
  },
  birthday_continue: {
    en: 'Continue',
    'ar-EG': 'استمري',
    it: 'Continua',
    el: 'Συνέχεια',
    fr: 'Continuer',
  },
  birthday_entry_label: {
    en: 'Open your birthday celebration',
    'ar-EG': 'افتحي احتفال عيد ميلادك',
    it: 'Apri la tua festa di compleanno',
    el: 'Άνοιξε τη γιορτή των γενεθλίων σου',
    fr: "Ouvrir ta fête d'anniversaire",
  },
  birthday_entry_replay_label: {
    en: 'Revisit your birthday celebration',
    'ar-EG': 'ارجعي لاحتفال عيد ميلادك',
    it: 'Rivivi la tua festa di compleanno',
    el: 'Ξαναζήσε τη γιορτή των γενεθλίων σου',
    fr: "Revivre ta fête d'anniversaire",
  },
  birthday_extinguish_candle: {
    en: 'Blow out the candles',
    'ar-EG': 'طفّي الشمع',
    it: 'Spegni le candeline',
    el: 'Σβήσε τα κεριά',
    fr: 'Souffle les bougies',
  },
  birthday_gift_achievement_label: {
    en: 'A special achievement',
    'ar-EG': 'إنجاز مميز',
    it: 'Un traguardo speciale',
    el: 'Ένα ξεχωριστό επίτευγμα',
    fr: 'Un succès spécial',
  },
  birthday_gift_claim: {
    en: 'Claim your gifts',
    'ar-EG': 'استلمي هداياكِ',
    it: 'Ritira i tuoi regali',
    el: 'Παράλαβε τα δώρα σου',
    fr: 'Récupère tes cadeaux',
  },
  birthday_gift_claimed: {
    en: 'Your gifts are yours to keep.',
    'ar-EG': 'هداياكِ بقت ليكِ.',
    it: 'I tuoi regali sono ormai tuoi.',
    el: 'Τα δώρα σου είναι πλέον δικά σου.',
    fr: 'Tes cadeaux sont désormais à toi.',
  },
  birthday_gift_decoration_label: {
    en: 'A decoration for your Cottage',
    'ar-EG': 'ديكور لكوخكِ',
    it: 'Una decorazione per il tuo Cottage',
    el: 'Μια διακόσμηση για το σπιτάκι σου',
    fr: 'Une décoration pour ton Cottage',
  },
  birthday_gift_decoration_placed_hint: {
    en: 'You can place it in your Cottage whenever you like.',
    'ar-EG': 'تقدري تحطيه في كوخكِ وقت ما تحبي.',
    it: 'Puoi posizionarla nel tuo Cottage quando vuoi.',
    el: 'Μπορείς να το τοποθετήσεις στο σπιτάκι σου όποτε θέλεις.',
    fr: 'Tu peux la placer dans ton Cottage quand tu veux.',
  },
  birthday_gift_letter_label: {
    en: 'A letter, just for you',
    'ar-EG': 'رسالة ليكِ إنتِ بس',
    it: 'Una lettera, solo per te',
    el: 'Ένα γράμμα, μόνο για σένα',
    fr: 'Une lettre, rien que pour toi',
  },
  birthday_gifts_intro: {
    en: 'A few small things are waiting for you.',
    'ar-EG': 'في حاجات صغيرة مستنياكِ.',
    it: 'Alcune piccole cose ti stanno aspettando.',
    el: 'Μερικά μικρά πράγματα σε περιμένουν.',
    fr: "Quelques petites choses t'attendent.",
  },
  birthday_greeting: {
    en: 'Happy birthday, Veoulla! 🎉',
    'ar-EG': 'كل سنة وإنتِ طيبة يا فيولا! 🎉',
    it: 'Buon compleanno, Veoulla! 🎉',
    el: 'Χρόνια πολλά, Βεούλα! 🎉',
    fr: 'Joyeux anniversaire, Veoulla ! 🎉',
  },
  birthday_invite: {
    en: 'Something is waiting for you… would you like to celebrate now?',
    'ar-EG': 'في حاجة مستنياكِ… حابة تحتفلي دلوقتي؟',
    it: "C'è qualcosa che ti aspetta… vuoi festeggiare adesso?",
    el: 'Κάτι σε περιμένει… θέλεις να γιορτάσεις τώρα;',
    fr: 'Quelque chose t’attend… veux-tu célébrer maintenant ?',
  },
  birthday_later: {
    en: 'Later',
    'ar-EG': 'بعدين',
    it: 'Più tardi',
    el: 'Αργότερα',
    fr: 'Plus tard',
  },
  birthday_letter_pending: {
    en: 'Your letter is still being written…',
    'ar-EG': 'رسالتك لسه بتتكتب…',
    it: 'La tua lettera è ancora in scrittura…',
    el: 'Το γράμμα σου γράφεται ακόμα…',
    fr: "Ta lettre est encore en train d'être écrite…",
  },
  birthday_letter_title: {
    en: 'A letter for you',
    'ar-EG': 'رسالة ليكِ',
    it: 'Una lettera per te',
    el: 'Ένα γράμμα για σένα',
    fr: 'Une lettre pour toi',
  },
  birthday_menu_intro: {
    en: 'Welcome back to your celebration.',
    'ar-EG': 'أهلاً بيكِ تاني في احتفالك.',
    it: 'Bentornata alla tua festa.',
    el: 'Καλώς ήρθες ξανά στη γιορτή σου.',
    fr: 'Bon retour dans ta fête.',
  },
  birthday_replay_badge: {
    en: 'Replay',
    'ar-EG': 'إعادة',
    it: 'Replay',
    el: 'Επανάληψη',
    fr: 'Rejouer',
  },
  birthday_replay_celebration: {
    en: 'Your celebration is still here — would you like to enjoy it?',
    'ar-EG': 'احتفالك لسه هنا… حابة تستمتعي بيه؟',
    it: 'La tua festa è ancora qui — vuoi goderla?',
    el: 'Η γιορτή σου είναι ακόμα εδώ — θέλεις να τη ζήσεις;',
    fr: 'Ta fête est toujours là — veux-tu en profiter ?',
  },
  birthday_replay_celebration_cta: {
    en: 'Celebrate again',
    'ar-EG': 'نحتفل تاني',
    it: 'Festeggia di nuovo',
    el: 'Γιόρτασε ξανά',
    fr: 'Célébrer à nouveau',
  },
  birthday_replay_countdown: {
    en: 'Replay the final countdown',
    'ar-EG': 'أعيدي آخر عد تنازلي',
    it: 'Rivivi il conto alla rovescia finale',
    el: 'Ξαναζήσε την τελική αντίστροφη μέτρηση',
    fr: 'Revivre le compte à rebours final',
  },
  birthday_replay_countdown_cta: {
    en: 'Replay the last 20 seconds',
    'ar-EG': 'أعيدي آخر ٢٠ ثانية',
    it: 'Rivivi gli ultimi 20 secondi',
    el: 'Ξαναζήσε τα τελευταία 20 δευτερόλεπτα',
    fr: 'Revivre les 20 dernières secondes',
  },
  birthday_seconds_label: {
    en: 'seconds',
    'ar-EG': 'ثانية',
    it: 'secondi',
    el: 'δευτερόλεπτα',
    fr: 'secondes',
  },
  birthday_skip: { en: 'Skip', 'ar-EG': 'تخطي', it: 'Salta', el: 'Παράλειψη', fr: 'Passer' },
  birthday_wish_placeholder: {
    en: 'Type your wish here…',
    'ar-EG': 'اكتبي أمنيتك هنا…',
    it: 'Scrivi qui il tuo desiderio…',
    el: 'Γράψε την ευχή σου εδώ…',
    fr: 'Écris ton vœu ici…',
  },
  birthday_wish_prompt: {
    en: "Make a wish — it's just for you.",
    'ar-EG': 'اتمني أمنية… بس ليكِ إنتِ.',
    it: 'Esprimi un desiderio — è solo per te.',
    el: 'Κάνε μια ευχή — είναι μόνο για σένα.',
    fr: "Fais un vœu — il n'appartient qu'à toi.",
  },
  birthday_wish_save: {
    en: 'Save my wish',
    'ar-EG': 'احفظي أمنيتي',
    it: 'Salva il mio desiderio',
    el: 'Αποθήκευσε την ευχή μου',
    fr: 'Enregistrer mon vœu',
  },
  birthday_wish_saved: {
    en: 'Your wish is safe with you.',
    'ar-EG': 'أمنيتك محفوظة ليكِ.',
    it: 'Il tuo desiderio è al sicuro con te.',
    el: 'Η ευχή σου είναι ασφαλής.',
    fr: 'Ton vœu est bien gardé.',
  },
  ach_birthday_2026_title: {
    en: 'Happy Birthday, Veoulla!',
    'ar-EG': 'كل سنة وإنتِ طيبة يا فيولا!',
    it: 'Buon compleanno, Veoulla!',
    el: 'Χρόνια πολλά, Βεούλα!',
    fr: 'Joyeux anniversaire, Veoulla !',
  },
  ach_birthday_2026_desc: {
    en: "Celebrated Veoulla's birthday in her own world.",
    'ar-EG': 'احتفلتِ بعيد ميلاد فيولا في عالمها.',
    it: 'Hai festeggiato il compleanno di Veoulla nel suo mondo.',
    el: 'Γιόρτασες τα γενέθλια της Βεούλα στον κόσμο της.',
    fr: "Tu as célébré l'anniversaire de Veoulla dans son monde.",
  },
};

function buildUiTextRows() {
  const rows = [];
  for (const [textId, byLocale] of Object.entries(UI_TEXT)) {
    for (const [locale, text] of Object.entries(byLocale)) {
      rows.push({
        ui_text_row_id: `uit_${textId}_${rowSuffix(locale)}`,
        text_id: textId,
        screen_id: 'birthday',
        component_id: textId.startsWith('ach_') ? 'achievement' : textId.replace('birthday_', ''),
        locale,
        text,
        direction: DIRECTIONS[locale],
        aria_label: '',
        enabled: 'TRUE',
        version: '1',
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`Mode: ${APPLY ? 'APPLY (live write)' : 'PREVIEW ONLY (pass --apply to write)'}\n`);

console.log('## 1. Event date/time fix');
await patchBirthdayDates(client, gateway, APPLY);
if (process.argv.includes('--event-dates-only')) process.exit(0);

console.log('\n## 2. Birthday letter (19_MESSAGES)');
const letterRows = buildLetterRows();
const existingLetters = await gateway.readTab('19_MESSAGES', { bypass: true });
const alreadyThere = new Set(
  existingLetters.rows
    .filter((r) => r.raw.message_id === 'msg_birthday_2026')
    .map((r) => r.primaryKeyValue),
);
for (const row of letterRows) {
  console.log(
    `  ${alreadyThere.has(row.message_row_id) ? 'EXISTS' : 'WILL ADD'} ${row.message_row_id} (${row.locale}, ${row.text.length} chars)`,
  );
}
if (APPLY) {
  const result = await gateway.appendRowsIfAbsent('19_MESSAGES', letterRows);
  console.log('  created:', result.created, 'existing:', result.existing);
}

console.log('\n## 3. Achievement (23_ACHIEVEMENTS)');
const achievementRow = buildAchievementRow();
const existingAch = await gateway.findByPrimaryKey(
  '23_ACHIEVEMENTS',
  achievementRow.achievement_id,
  {
    bypass: true,
  },
);
console.log(`  ${existingAch ? 'EXISTS' : 'WILL ADD'} ${achievementRow.achievement_id}`);
if (APPLY) {
  const result = await gateway.appendIfAbsent(
    '23_ACHIEVEMENTS',
    achievementRow.achievement_id,
    () => achievementRow,
  );
  console.log('  created:', result.created);
}

console.log('\n## 4. UI text (08_UI_TEXT)');
const uiTextRows = buildUiTextRows();
const existingUiText = await gateway.readTab('08_UI_TEXT', { bypass: true });
const existingUiTextIds = new Set(existingUiText.rows.map((r) => r.primaryKeyValue));
const newCount = uiTextRows.filter((r) => !existingUiTextIds.has(r.ui_text_row_id)).length;
console.log(
  `  ${uiTextRows.length} rows total, ${newCount} new, ${uiTextRows.length - newCount} already present.`,
);
if (APPLY) {
  const result = await gateway.appendRowsIfAbsent('08_UI_TEXT', uiTextRows);
  console.log('  created:', result.created.length, 'existing:', result.existing.length);
}

console.log(`\nDone. ${APPLY ? 'Live writes applied.' : 'No writes performed (preview only).'}`);
