import type { RuntimeUiTextEntry } from '@veoullas-world/contracts';
import { resolveUiText } from './resolveText';
import type { LocaleCode } from './locales';

// Sheet-first UI copy, with the same five-locale offline fallback as ContinueButton.
const labels = {
  interact: ['Interact', 'تفاعلي', 'Interagisci', 'Αλληλεπίδραση', 'Interagir'],
  attempts: [
    '{count} attempt(s) remaining before a short cooldown.',
    'فاضل {count} محاولة قبل الانتظار.',
    '{count} tentativi rimasti prima di una breve pausa.',
    'Απομένουν {count} προσπάθειες πριν από μια μικρή παύση.',
    'Il reste {count} tentative(s) avant une courte pause.',
  ],
  skip: [
    'Skip to content',
    'روحي للمحتوى',
    'Vai al contenuto',
    'Μετάβαση στο περιεχόμενο',
    'Aller au contenu',
  ],
  increase: ['Increase', 'زودي', 'Aumenta', 'Αύξηση', 'Augmenter'],
  decrease: ['Decrease', 'قللي', 'Diminuisci', 'Μείωση', 'Diminuer'],
  settings: ['Settings', 'الإعدادات', 'Impostazioni', 'Ρυθμίσεις', 'Réglages'],
  language: ['Language', 'اللغة', 'Lingua', 'Γλώσσα', 'Langue'],
  logout: ['Log out', 'تسجيل الخروج', 'Esci', 'Αποσύνδεση', 'Se déconnecter'],
  back: ['Walk back', 'ارجعي', 'Torna indietro', 'Πίσω', 'Reculer'],
  forward: ['Walk forward', 'اتقدمي', 'Avanza', 'Προχώρα', 'Avancer'],
  lookLeft: ['Look left', 'بصي شمال', 'Guarda a sinistra', 'Κοίτα αριστερά', 'Regarder à gauche'],
  lookRight: ['Look right', 'بصي يمين', 'Guarda a destra', 'Κοίτα δεξιά', 'Regarder à droite'],
  shell: [
    'A shell on the sand',
    'صدفة على الرمل',
    'Una conchiglia sulla sabbia',
    'Ένα κοχύλι στην άμμο',
    'Un coquillage sur le sable',
  ],
  path_to_steps: [
    'Path to the three steps',
    'الطريق للتلات درجات',
    'Verso i tre gradini',
    'Προς τα τρία σκαλιά',
    'Vers les trois marches',
  ],
  church_door_hint: [
    'The Church door ahead',
    'باب الكنيسة قدامك',
    'La porta della chiesa',
    'Η πόρτα της εκκλησίας',
    'La porte de l’église',
  ],
  church_door: [
    'Church entrance',
    'مدخل الكنيسة',
    'Ingresso della chiesa',
    'Είσοδος εκκλησίας',
    'Entrée de l’église',
  ],
  road_onward: [
    'The road onward',
    'الطريق اللي قدام',
    'La strada avanti',
    'Ο δρόμος μπροστά',
    'La route devant',
  ],
  name: ['Name', 'الاسم', 'Nome', 'Όνομα', 'Nom'],
  gender: [
    'Gender / presentation',
    'النوع / الوصف',
    'Genere / presentazione',
    'Φύλο / παρουσίαση',
    'Genre / présentation',
  ],
  confirm: ['Confirm', 'تأكيد', 'Conferma', 'Επιβεβαίωση', 'Confirmer'],
  saving: ['Saving…', 'جارٍ الحفظ…', 'Salvataggio…', 'Αποθήκευση…', 'Enregistrement…'],
  requiredName: [
    'Please choose a name.',
    'اختاري اسم.',
    'Scegli un nome.',
    'Διάλεξε ένα όνομα.',
    'Choisissez un nom.',
  ],
  requiredGender: [
    'Please choose a gender or presentation description.',
    'اختاري النوع أو الوصف.',
    'Scegli un genere o una descrizione.',
    'Διάλεξε φύλο ή περιγραφή.',
    'Choisissez un genre ou une description.',
  ],
  saveError: [
    'Could not save. Please try again.',
    'الحفظ ما تمش. حاولي تاني.',
    'Salvataggio non riuscito. Riprova.',
    'Η αποθήκευση απέτυχε. Δοκίμασε ξανά.',
    'Enregistrement impossible. Réessayez.',
  ],
  loading: ['Loading…', 'جارٍ التحميل…', 'Caricamento…', 'Φόρτωση…', 'Chargement…'],
  retry: ['Retry', 'حاولي تاني', 'Riprova', 'Ξανά', 'Réessayer'],
  enter: ['Enter', 'ادخلي', 'Entra', 'Είσοδος', 'Entrer'],
  code: [
    'Four-digit Gate code',
    'كود البوابة من أربع أرقام',
    'Codice del cancello a quattro cifre',
    'Τετραψήφιος κωδικός πύλης',
    'Code du portail à quatre chiffres',
  ],
  digit1: ['First digit', 'الرقم الأول', 'Prima cifra', 'Πρώτο ψηφίο', 'Premier chiffre'],
  digit2: ['Second digit', 'الرقم التاني', 'Seconda cifra', 'Δεύτερο ψηφίο', 'Deuxième chiffre'],
  digit3: ['Third digit', 'الرقم التالت', 'Terza cifra', 'Τρίτο ψηφίο', 'Troisième chiffre'],
  digit4: ['Fourth digit', 'الرقم الرابع', 'Quarta cifra', 'Τέταρτο ψηφίο', 'Quatrième chiffre'],
  invalid: [
    'Incorrect code. Please try again.',
    'الكود مش صحيح. حاولي تاني.',
    'Codice errato. Riprova.',
    'Λάθος κωδικός. Δοκίμασε ξανά.',
    'Code incorrect. Réessayez.',
  ],
  cooldown: [
    'Too many attempts. Try again in {count} seconds.',
    'محاولات كتير. حاولي كمان {count} ثانية.',
    'Troppi tentativi. Riprova tra {count} secondi.',
    'Πολλές προσπάθειες. Δοκίμασε σε {count} δευτερόλεπτα.',
    'Trop de tentatives. Réessayez dans {count} secondes.',
  ],
  offline: [
    'Could not connect. Please try again.',
    'الاتصال مش متاح. حاولي تاني.',
    'Connessione non riuscita. Riprova.',
    'Δεν ήταν δυνατή η σύνδεση. Δοκίμασε ξανά.',
    'Connexion impossible. Réessayez.',
  ],
} as const;
export const playerLanguageNames = [
  'English',
  'العربية المصرية',
  'Italiano',
  'Ελληνικά',
  'Français',
];
export type PlayerTextKey = keyof typeof labels;
export function playerText(key: string, locale: LocaleCode, entries: RuntimeUiTextEntry[] = []) {
  const resolved = resolveUiText(entries, `player_${key}`, locale);
  const fallback = labels[key as PlayerTextKey] ?? labels.interact;
  return resolved.isMissing
    ? (fallback[['en', 'ar-EG', 'it', 'el', 'fr'].indexOf(locale)] ?? fallback[0])
    : resolved.text;
}
