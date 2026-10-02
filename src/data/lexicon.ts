/**
 * Clinical terminology lexicon.
 *
 * This is the product. The code is generic; the clinical value is here.
 *
 * Three safety tiers, mirroring the rule "if you look at 100 real Iranian
 * clinical notes and the term is always Latin script, put it in Tier 1/2; if
 * it is mixed, flag it; if it is always Persian, do not touch it."
 *
 *   tier 1  Safe substitution      -> substituted, no flag.
 *   tier 2  Clinical substitution  -> substituted and underlined for review.
 *   tier 3  Ambiguous / confusable -> never substituted, flagged for the clinician.
 *
 * Symptoms, narrative, body parts and spoken dosage schedules are deliberately
 * absent: they are not written in Latin in real notes, and rewriting them
 * would change the meaning of the note.
 */

export type Tier = 1 | 2 | 3;

export interface Term {
  /** Canonical Latin output. */
  en: string;
  tier: Tier;
  /** Category, shown in the lexicon manager. */
  category: "drug" | "lab" | "vital" | "unit" | "procedure" | "department" | "diagnosis" | "abbreviation";
  /** Optional note explaining a tier 3 decision. */
  note?: string;
}

export type LexiconEntry = [source: string, term: Term];

/** Every phrase is a Persian or Persianised-English written form. */
export const LEXICON: Record<string, LexiconEntry[]> = {
  drug: [
    ["متفورمین", { en: "metformin", tier: 2, category: "drug" }],
    ["گلیبنکلامید", { en: "glibenclamide", tier: 2, category: "drug" }],
    ["گلیکلازید", { en: "gliclazide", tier: 2, category: "drug" }],
    ["امسولین", { en: "insulin", tier: 2, category: "drug" }],
    ["انسولین", { en: "insulin", tier: 2, category: "drug" }],
    ["سیتروپیل", { en: "sitagliptin", tier: 2, category: "drug" }],
    ["متوپرولول", { en: "metoprolol", tier: 3, category: "drug", note: "Acoustically close to metformin — verify." }],
    ["پروپرانولول", { en: "propranolol", tier: 2, category: "drug" }],
    ["بیسوپرولول", { en: "bisoprolol", tier: 2, category: "drug" }],
    ["آتروواستاتین", { en: "atorvastatin", tier: 2, category: "drug" }],
    ["سیمواستاتین", { en: "simvastatin", tier: 2, category: "drug" }],
    ["رزیواستاتین", { en: "rosuvastatin", tier: 2, category: "drug" }],
    ["لیتیوم", { en: "lithium", tier: 2, category: "drug" }],
    ["والپروات", { en: "valproate", tier: 2, category: "drug" }],
    ["کاربامازپین", { en: "carbamazepine", tier: 2, category: "drug" }],
    ["فنی توئین", { en: "phenytoin", tier: 2, category: "drug" }],
    ["لاموتریژین", { en: "lamotrigine", tier: 2, category: "drug" }],
    ["کلونازپام", { en: "clonazepam", tier: 2, category: "drug" }],
    ["دیازپام", { en: "diazepam", tier: 2, category: "drug" }],
    ["لورازپام", { en: "lorazepam", tier: 2, category: "drug" }],
    ["آلپرازولام", { en: "alprazolam", tier: 2, category: "drug" }],
    ["فلوکستین", { en: "fluoxetine", tier: 2, category: "drug" }],
    ["سرترالین", { en: "sertraline", tier: 2, category: "drug" }],
    ["ونلافلاکسین", { en: "venlafaxine", tier: 2, category: "drug" }],
    ["آمی تریپتیلین", { en: "amitriptyline", tier: 2, category: "drug" }],
    ["کوئتیاپین", { en: "quetiapine", tier: 2, category: "drug" }],
    ["ریسپریدون", { en: "risperidone", tier: 2, category: "drug" }],
    ["هالوپریدول", { en: "haloperidol", tier: 2, category: "drug" }],
    ["اولانزپین", { en: "olanzapine", tier: 2, category: "drug" }],
    ["مورفین", { en: "morphine", tier: 2, category: "drug" }],
    ["ترامادول", { en: "tramadol", tier: 2, category: "drug" }],
    ["کدئین", { en: "codeine", tier: 2, category: "drug" }],
    ["هیدروکدئین", { en: "hydrocodone", tier: 2, category: "drug" }],
    ["استامینوفن", { en: "paracetamol", tier: 2, category: "drug" }],
    ["پاراتامول", { en: "paracetamol", tier: 2, category: "drug" }],
    ["ایبوپروفن", { en: "ibuprofen", tier: 2, category: "drug" }],
    ["ناپروکسن", { en: "naproxen", tier: 2, category: "drug" }],
    ["دیکلوفناک", { en: "diclofenac", tier: 2, category: "drug" }],
    ["آسپرین", { en: "aspirin", tier: 2, category: "drug" }],
    ["کلپیدوگرل", { en: "clopidogrel", tier: 2, category: "drug" }],
    ["وارفارین", { en: "warfarin", tier: 2, category: "drug" }],
    ["هپارین", { en: "heparin", tier: 2, category: "drug" }],
    ["انوکساپارین", { en: "enoxaparin", tier: 2, category: "drug" }],
    ["سالبوتامول", { en: "salbutamol", tier: 2, category: "drug" }],
    ["بودزونید", { en: "budesonide", tier: 2, category: "drug" }],
    ["مونته لوکاست", { en: "montelukast", tier: 2, category: "drug" }],
    ["آموکسی سیلین", { en: "amoxicillin", tier: 2, category: "drug" }],
    ["سیپروفلوکساسین", { en: "ciprofloxacin", tier: 2, category: "drug" }],
    ["آزیترومایسین", { en: "azithromycin", tier: 2, category: "drug" }],
    ["مترونیدازول", { en: "metronidazole", tier: 2, category: "drug" }],
    ["کلیندامایسین", { en: "clindamycin", tier: 2, category: "drug" }],
    ["ونکومایسین", { en: "vancomycin", tier: 2, category: "drug" }],
    ["سیفالکسین", { en: "cephalexin", tier: 2, category: "drug" }],
    ["لووتیروکسین", { en: "levothyroxine", tier: 2, category: "drug" }],
    ["پردنیزولون", { en: "prednisolone", tier: 2, category: "drug" }],
    ["دگزامتازون", { en: "dexamethasone", tier: 2, category: "drug" }],
    ["هیدروکورتیزون", { en: "hydrocortisone", tier: 2, category: "drug" }],
    ["کلشیسین", { en: "colchicine", tier: 2, category: "drug" }],
    ["آلوپورینول", { en: "allopurinol", tier: 2, category: "drug" }],
    ["امپریلیل", { en: "enalapril", tier: 2, category: "drug" }],
    ["کاپوتوپریل", { en: "captopril", tier: 2, category: "drug" }],
    ["لوسارتان", { en: "losartan", tier: 2, category: "drug" }],
    ["والسارتان", { en: "valsartan", tier: 2, category: "drug" }],
    ["آملودیپین", { en: "amlodipine", tier: 2, category: "drug" }],
    ["نیتروگلیسیرین", { en: "nitroglycerin", tier: 2, category: "drug" }],
    ["فوروزماید", { en: "furosemide", tier: 2, category: "drug" }],
    ["هیدروکلوروتیازید", { en: "hydrochlorothiazide", tier: 2, category: "drug" }],
    ["اسپیرونولاکتون", { en: "spironolactone", tier: 2, category: "drug" }],
    ["متوکلوپرامید", { en: "metoclopramide", tier: 2, category: "drug" }],
    ["اوندانترون", { en: "ondansetron", tier: 2, category: "drug" }],
    ["دومپریدون", { en: "domperidone", tier: 2, category: "drug" }],
    ["گاباپنتین", { en: "gabapentin", tier: 2, category: "drug" }],
    ["پرگابالین", { en: "pregabalin", tier: 2, category: "drug" }],
    ["ایپراتروپیوم", { en: "ipratropium", tier: 2, category: "drug" }],
    ["فورموترول", { en: "formoterol", tier: 2, category: "drug" }],
    ["لوراتادین", { en: "loratadine", tier: 2, category: "drug" }],
    ["سیتیریزین", { en: "cetirizine", tier: 2, category: "drug" }],
  ],
  lab: [
    ["همودیاموگرافی کامل", { en: "CBC", tier: 1, category: "lab" }],
    ["شمارش سلول های سفید", { en: "WBC", tier: 1, category: "lab" }],
    ["گلبول سفید", { en: "WBC", tier: 3, category: "lab", note: "Often means 'increased WBC' in context — left as written." }],
    ["هموگلوبین", { en: "Hb", tier: 1, category: "lab" }],
    ["هماتوکریت", { en: "Hct", tier: 1, category: "lab" }],
    ["پلاکت", { en: "Plt", tier: 1, category: "lab" }],
    ["نیتروژن اوره خون", { en: "BUN", tier: 1, category: "lab" }],
    ["اوره خون", { en: "BUN", tier: 1, category: "lab" }],
    ["کراتینین", { en: "Cr", tier: 1, category: "lab" }],
    ["سدیم", { en: "Na", tier: 1, category: "lab" }],
    ["پتاسیم", { en: "K", tier: 1, category: "lab" }],
    ["کلسیم", { en: "Ca", tier: 1, category: "lab" }],
    ["قند ناشتا", { en: "FBS", tier: 1, category: "lab" }],
    ["قند خون", { en: "FBS", tier: 3, category: "lab", note: "Means blood sugar as a concept, not a specific test — left as written." }],
    ["هموگلوبین گلیکوزیله", { en: "HbA1c", tier: 1, category: "lab" }],
    ["هموگلوبین ای وان سی", { en: "HbA1c", tier: 1, category: "lab" }],
    ["کلسترول بد", { en: "LDL", tier: 1, category: "lab" }],
    ["کلسترول خوب", { en: "HDL", tier: 1, category: "lab" }],
    ["تری گلیسیرید", { en: "TG", tier: 1, category: "lab" }],
    ["پروفایل چربی", { en: "lipid profile", tier: 1, category: "lab" }],
    ["تی اس تی", { en: "TSH", tier: 1, category: "lab" }],
    ["تی چهار", { en: "T4", tier: 1, category: "lab" }],
    ["آنزیم های کبدی", { en: "LFT", tier: 1, category: "lab" }],
    ["اس تی اس تی", { en: "AST", tier: 1, category: "lab" }],
    ["آلت", { en: "ALT", tier: 3, category: "lab", note: "Common Persian word outside a lab context — left as written." }],
    ["آلکالن فسفاتاز", { en: "ALP", tier: 1, category: "lab" }],
    ["بیلی روبین", { en: "bilirubin", tier: 1, category: "lab" }],
    ["پروترومبین", { en: "PT", tier: 1, category: "lab" }],
    ["ان آر", { en: "INR", tier: 1, category: "lab" }],
    ["پی تی تی", { en: "PTT", tier: 1, category: "lab" }],
    ["پروتئین واکنشی سی", { en: "CRP", tier: 1, category: "lab" }],
    ["سی آر پی", { en: "CRP", tier: 1, category: "lab" }],
    ["فریتین", { en: "ferritin", tier: 1, category: "lab" }],
    ["آزمایش ادرار", { en: "UA", tier: 1, category: "lab" }],
    ["کشت ادرار", { en: "UC", tier: 1, category: "lab" }],
    ["ویتامین دی", { en: "vitamin D", tier: 1, category: "lab" }],
    ["منیزیم", { en: "Mg", tier: 1, category: "lab" }],
  ],
  vital: [
    ["فشار خون", { en: "BP", tier: 1, category: "vital" }],
    ["نبض", { en: "HR", tier: 1, category: "vital" }],
    ["ضربان قلب", { en: "HR", tier: 3, category: "vital", note: "Frequently the complaint 'palpitations' — never auto-substituted." }],
    ["اشباع اکسیژن", { en: "SpO2", tier: 1, category: "vital" }],
    ["تعداد تنفس", { en: "RR", tier: 1, category: "vital" }],
  ],
  procedure: [
    ["سی تی اسکن", { en: "CT scan", tier: 1, category: "procedure" }],
    ["سی تی", { en: "CT", tier: 1, category: "procedure" }],
    ["ام آر آی", { en: "MRI", tier: 1, category: "procedure" }],
    ["ام آر ای", { en: "MRI", tier: 1, category: "procedure" }],
    ["سونوگرافی", { en: "ultrasound", tier: 1, category: "procedure" }],
    ["اکوکاردیوگرافی", { en: "echocardiography", tier: 1, category: "procedure" }],
    ["اکو", { en: "echo", tier: 1, category: "procedure" }],
    ["نوار قلب", { en: "ECG", tier: 1, category: "procedure" }],
    ["الکتروکاردیوگرافی", { en: "ECG", tier: 1, category: "procedure" }],
    ["کولونوسکوپی", { en: "colonoscopy", tier: 1, category: "procedure" }],
    ["آندوسکوپی", { en: "endoscopy", tier: 1, category: "procedure" }],
    ["اندوسکوپی", { en: "endoscopy", tier: 1, category: "procedure" }],
    ["برونکوسکوپی", { en: "bronchoscopy", tier: 1, category: "procedure" }],
    ["بیوپسی", { en: "biopsy", tier: 1, category: "procedure" }],
    ["آنژیوگرافی", { en: "angiography", tier: 1, category: "procedure" }],
    ["آنژیوپلاستی", { en: "angioplasty", tier: 1, category: "procedure" }],
    ["آنژیوگرافی کرونری", { en: "coronary angiography", tier: 1, category: "procedure" }],
    ["بایپس کرونری", { en: "CABG", tier: 1, category: "procedure" }],
    ["پی سی آی", { en: "PCI", tier: 1, category: "procedure" }],
    ["رادیولوژی", { en: "radiology", tier: 1, category: "procedure" }],
  ],
  department: [
    ["سی سی یو", { en: "CCU", tier: 1, category: "department" }],
    ["آی سی یو", { en: "ICU", tier: 1, category: "department" }],
    ["نی کو یو", { en: "NICU", tier: 1, category: "department" }],
    ["اورژانس", { en: "ED", tier: 1, category: "department" }],
    ["اتاق عمل", { en: "OR", tier: 1, category: "department" }],
    ["بخش", { en: "ward", tier: 3, category: "department", note: "Too generic to rewrite — left as written." }],
  ],
  abbreviation: [
    ["آی وی", { en: "IV", tier: 1, category: "abbreviation" }],
    ["پی او", { en: "PO", tier: 1, category: "abbreviation" }],
    ["آی ام", { en: "IM", tier: 1, category: "abbreviation" }],
    ["اس سی", { en: "SC", tier: 1, category: "abbreviation" }],
    ["ان پی او", { en: "NPO", tier: 1, category: "abbreviation" }],
    ["هیچ چیز دهانی", { en: "NPO", tier: 1, category: "abbreviation" }],
    ["فوری", { en: "STAT", tier: 3, category: "abbreviation", note: "Usually means 'urgently' in an ordering sentence, not a STAT order." }],
  ],
  diagnosis: [
    ["سکته قلبی", { en: "MI", tier: 1, category: "diagnosis" }],
    ["فشار خون بالا", { en: "HTN", tier: 1, category: "diagnosis" }],
    ["دیابت تایپ دو", { en: "type 2 DM", tier: 1, category: "diagnosis" }],
    ["تایپ دو دیابت", { en: "type 2 DM", tier: 1, category: "diagnosis" }],
    ["دیابت ملیتوس", { en: "DM", tier: 1, category: "diagnosis" }],
    ["دیابت", { en: "DM", tier: 1, category: "diagnosis" }],
    ["بیماری انسدادی مزمن ریه", { en: "COPD", tier: 1, category: "diagnosis" }],
    ["آسم", { en: "asthma", tier: 1, category: "diagnosis" }],
    ["بیماری رفلاکس", { en: "GERD", tier: 1, category: "diagnosis" }],
    ["عفونت ادراری", { en: "UTI", tier: 1, category: "diagnosis" }],
    ["آمبولی ریه", { en: "PE", tier: 1, category: "diagnosis" }],
    ["ترومبوز وریدی عمقی", { en: "DVT", tier: 1, category: "diagnosis" }],
    ["فیبریلاسیون دهلیزی", { en: "AFib", tier: 1, category: "diagnosis" }],
    ["نارسایی قلبی", { en: "CHF", tier: 1, category: "diagnosis" }],
    ["سکته مغزی", { en: "CVA", tier: 1, category: "diagnosis" }],
    ["کم خونی", { en: "anemia", tier: 1, category: "diagnosis" }],
    ["کمکم خونی", { en: "anemia", tier: 1, category: "diagnosis" }],
    ["کبد چرب", { en: "fatty liver", tier: 1, category: "diagnosis" }],
    ["رینیت آلرژیک", { en: "allergic rhinitis", tier: 1, category: "diagnosis" }],
    ["آنوریسم", { en: "aneurysm", tier: 1, category: "diagnosis" }],
  ],
};

/** Known acoustic confusions: both members stay unsubstituted until reviewed. */
export const CONFUSABLE_GROUPS: string[][] = [
  ["متفورمین", "متوپرولول", "متوپرول"],
  ["آملودیپین", "آتروواستاتین", "آتورواستاتین"],
  ["کلیندامایسین", "کلیندامیسین"],
  ["سیپروفلوکساسین", "سیپروفلوکسین"],
  ["نیتروگلیسیرین", "نیتروگلیسرین"],
  ["وارفارین", "والفارین", "والپروات"],
  ["لووتیروکسین", "لووتیروکسین", "لیتیوم"],
  ["آموکسی سیلین", "آموکسی کلاولانیک اسید", "آمپی سیلین"],
];

/** Voice commands, honoured only as the final word of an utterance. */
export const VOICE_COMMANDS: Record<string, string> = {
  "نقطه": ".",
  "ویرگول": ",",
  "کاما": ",",
  "دو نقطه": ":",
  "دونقطه": ":",
  "علامت سوال": "?",
  "خط جدید": "\n",
  "پاراگراف": "\n",
  "پرانتز باز": "(",
  "پرانتز بسته": ")",
};

/** Every Persian surface form, for hotword biasing in the acoustic decoder. */
export function lexiconPhrases(): string[] {
  const phrases = new Set<string>();
  for (const group of Object.values(LEXICON)) {
    for (const [source] of group) phrases.add(source);
  }
  for (const group of CONFUSABLE_GROUPS) {
    for (const phrase of group) phrases.add(phrase);
  }
  return [...phrases].sort((a, b) => a.length - b.length);
}
