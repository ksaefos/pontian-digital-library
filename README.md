# Ποντιακή Ψηφιακή Βιβλιοθήκη — Σταθεροποίηση 2.4.0-rc1

> **Υποψήφια έκδοση προς επαλήθευση (release candidate), όχι έτοιμη δημοσίευση.**
> Η παρούσα διανομή βασίζεται στο πραγματικό ZIP `pontian-digital-library-main(2).zip` της 6ης Νοεμβρίου 2026. Η δημόσια έκδοση **δεν πρέπει να αντικατασταθεί** μέχρι να ολοκληρωθούν οι αυτοματοποιημένοι έλεγχοι στην προσωρινή διακλάδωση και οι δοκιμές με το Cloudflare Worker.

## Περιεχόμενα και ακεραιότητα

- Διατηρούνται **4 βιβλία**, **5.822 λήμματα** και **1.296 λήμματα με ξεχωριστό πεδίο ετυμολογίας**.
- Το αρχείο `library-data.json` μεταφέρθηκε **αυτούσιο**. Δεν έγινε καμία επαναδημιουργία ή αυτόματη «διόρθωση» των πρωτογενών δεδομένων.
- Το ιστορικό δημοσίευσης του GitHub παραμένει η δυνατότητα επαναφοράς. Η σύνδεση στο Cloudflare Worker συνεχίζει να χρησιμοποιεί τις υπάρχουσες μεταβλητές και τα Secrets.
- Καταργήθηκαν τα ορφανά `admin.js` και `SETUP-EL.md` για να μην υπάρχουν αντιφατικές οδηγίες εγκατάστασης. Το αρχείο αυτό είναι το μοναδικό README.

## Τι διορθώθηκε στον πηγαίο κώδικα

### Ακεραιότητα βιβλιοθήκης και Studio

1. Η επεξεργασία λήμματος διατηρεί **όλα** τα άγνωστα/μελλοντικά πεδία του αρχικού αντικειμένου, και ειδικά `etymology` και `references`.
2. Η εισαγωγή και συγχώνευση νέων λημμάτων διατηρεί επίσης πρόσθετα μεταδεδομένα.
3. Η μετατροπή `richHtml` → `text` διατηρεί τα `<br>`, τις παραγράφους μέσα σε `<blockquote>`, τις λίστες και τους πίνακες σε απλή αναπαράσταση.
4. Η μετατροπή παλιών επικεφαλίδων `data-heading="1"` κρατά το **H1** αντί να το υποβαθμίζει σε H3.
5. Η διαδικασία ανανέωσης παραπομπών δεν εκτελείται αυτόματα κατά το απλό άνοιγμα του Studio. Όταν καλείται από εργαλεία εισαγωγής/ενημέρωσης, **αναδημιουργεί** τις παραπομπές των σχετικών βιβλίων, αφαιρώντας παλιές θέσεις.
6. Πριν από τη δημοσίευση, ελέγχονται σε σχέση με το απομακρυσμένο αντίγραφο τυχόν χαμένα λήμματα, ετυμολογίες, παραπομπές, βιβλία, κεφάλαια ή `richHtml`. **Οποιαδήποτε απώλεια μπλοκάρει τη δημοσίευση** και παράγεται αυτόματο JSON backup. Πρόκειται για συντηρητικό μηχανισμό: ακόμη και σκόπιμες διαγραφές πρέπει προσωρινά να γίνονται μέσω ελεγχόμενης διαδικασίας.
7. Τα παλιά πλούσια κεφάλαια δεν επιτρέπεται να αλλοιωθούν από την εφεδρική επεξεργασία απλού κειμένου εάν ο WYSIWYG editor δεν λειτουργεί.
8. Αν ο browser δεν επιτρέψει την τοπική αποθήκευση πλήρους βιβλιοθήκης, εμφανίζεται προειδοποίηση. Η αποτυχία `localStorage` δεν αντιμετωπίζεται πλέον ως αποτυχία ανάκτησης από το GitHub, αλλά χρειάζεται άμεσο backup για να μη χαθούν τοπικά προσχέδια.

### TipTap — τοπικό ενιαίο bundle

- Καταργήθηκαν τα ανεξάρτητα `import` μέσω jsDelivr. Το Studio αναμένει μόνο `vendor/tiptap/tiptap.bundle.js`, που δημιουργείται με `esbuild` από κοινό γράφημα εξαρτήσεων npm.
- Οι εξαρτήσεις TipTap/ProseMirror έχουν δηλωθεί σε συγκεκριμένες εκδόσεις στο `package.json`.
- Διατηρούνται η **Barnebok Pontian**, H1–H3, έντονα, πλάγια, υπογράμμιση, στοίχιση, λίστες, πίνακες, συνδέσμοι HTTPS, εικόνες HTTPS και αναίρεση/επανάληψη.
- Προστέθηκε **Content Security Policy** στο `admin.html`, με hashes για τα ενσωματωμένα scripts. Τρίτος απομακρυσμένος κώδικας δεν εκτελείται στη σελίδα που διαχειρίζεται τον κωδικό Studio.
- **Σημαντικό:** Το bundle δεν έχει ακόμη κατασκευαστεί στο παρόν offline περιβάλλον. Το παράγει το workflow του GitHub και το υποβάλλει σε δοκιμή Chromium. Πριν ολοκληρωθεί αυτό το βήμα, τα κεφάλαια με `richHtml` παραμένουν μόνο για ανάγνωση στο Studio.

### Reader

- Το γλωσσάρι φορτώνεται πλέον **ανά βιβλίο**, χρησιμοποιώντας τις υπάρχουσες παραπομπές και τις δηλωμένες πηγές των 15 εγγραφών χωρίς references.
- Οι θέσεις ανάγνωσης αποθηκεύουν επιπλέον `chapterId` και επανασυνδέονται στο σωστό κεφάλαιο μετά από αλλαγή σειράς. Ο αριθμός σελίδας παραμένει εφεδρικός και **δεν** έχει αντικατασταθεί ακόμη από σταθερό offset κειμένου.
- Διορθώθηκαν οι αντικαταστάσεις HTML placeholders ώστε τίτλοι που περιέχουν `$&`, `$'` κ.λπ. να μη μεταβάλλονται.
- Βελτιώθηκε η ασφαλής σειριοποίηση JavaScript για U+2028/U+2029.
- Οι επιπλέον επικεφαλίδες H4–H6 αντιμετωπίζονται ως επικεφαλίδες στο ασφαλές parser. Διατηρούνται `colspan`/`rowspan` στους πίνακες, μέχρι 20, και οι εμφωλευμένες λίστες αποκτούν οπτική εσοχή. Διατηρούνται και τα άμεσα κείμενα των blockquotes.
- Το Hyphenopoly 6.1.0 πλέον αναμένεται **τοπικά** στον φάκελο `vendor/hyphenopoly/6.1.0`, με τα μονοτονικά/πολυτονικά πρότυπα. Τα απαραίτητα αρχεία θα γίνουν vendor από το GitHub Actions workflow.

### PWA και Worker

- Αφαιρέθηκε το νεκρό `studio/index.html` από το Service Worker.
- Το `admin.html` δεν προ-αποθηκεύεται πλέον στο cache κάθε επισκέπτη.
- Τα στατικά στοιχεία έχουν **network-first** πολιτική με offline fallback, μειώνοντας τον κίνδυνο να εμφανίζεται παλιό λογότυπο ή παλιό JavaScript μετά από ανάπτυξη.
- Μετά την παραγωγή των τοπικών bundles, το script κατασκευής ενημερώνει αυτόματα το αναγνωριστικό SW cache από hash των αρχείων, ώστε να ανανεωθεί η offline εγκατάσταση.
- Ο Worker μετρά το πραγματικό μήκος σε **UTF-8 bytes** του εισερχόμενου JSON πριν από τη δημοσίευση· ο SHA conflict έλεγχος παραμένει ενεργός.
- Δεν αποκαλύπτεται πλέον το ακατέργαστο σώμα αποτυχίας του GitHub API στον browser.

## Αυτοματοποιημένοι έλεγχοι

`node tests/regression.mjs` — χωρίς εγκατάσταση πρόσθετων πακέτων. Ελέγχει δομή δεδομένων, μοναδικά IDs, πραγματικό σενάριο επεξεργασίας λήμματος και διατήρησης μεταδεδομένων, ανανέωση references, προστασίες δημοσίευσης, CSP, Reader και Service Worker.

`python tests/html-conversion.py` — προαιρετική τοπική δοκιμή με Playwright/Chromium που ελέγχει ότι `<br>` και πολλαπλές παράγραφοι παραμένουν σωστά στο fallback text.

`npm run test:browser` — απαιτεί προηγουμένως `npm install`, `npm run build` και Chromium Playwright. Ελέγχει στον **πραγματικό browser** ότι ενεργοποιείται το τοπικό TipTap, λειτουργούν H1/H2/H3, εφαρμόζεται η Barnebok και δεν υπάρχει οριζόντια υπερχείλιση στον κινητό κατάλογο.

Η σύνδεση με αληθινό Worker και η δημοσίευση στο παραγωγικό GitHub δεν μπορούν να εκτελεστούν αυτόματα χωρίς τα μυστικά στοιχεία και δεν θεωρούνται δοκιμασμένες.

## Ασφαλής διαδικασία δοκιμής στο GitHub (προτεινόμενη)

1. Κράτησε το υπάρχον backup του `main`.
2. Στο GitHub άνοιξε το repository → **Branches** → δημιούργησε νέα προσωρινή διακλάδωση με όνομα **`stabilization-2.4`** από το `main`.
3. Ανέβασε το περιεχόμενο του παρόντος πακέτου **στην προσωρινή διακλάδωση**. Μην το ανεβάσεις ακόμη στο `main`.
4. Το workflow `.github/workflows/verify-and-build.yml` ενεργοποιείται όταν ανέβουν τα αρχεία στο `stabilization-2.4`. Θα κάνει `npm install`, θα δημιουργήσει το TipTap bundle και τα αρχεία Hyphenopoly, και θα τρέξει όλα τα tests.
5. Στην καρτέλα **Actions** παρακολούθησε το **Build and verify Pontian Library**. Εάν οι έλεγχοι αποτύχουν, **δεν** πραγματοποιείται commit των παραγόμενων assets και δεν πρέπει να συγχωνεύσεις τίποτα στο `main`.
6. Μόνο όταν περάσουν όλα, το workflow πραγματοποιεί commit των παραγόμενων αρχείων **στην ίδια προσωρινή διακλάδωση**. Τότε μπορείς να ελέγξεις τα `vendor/` και να δοκιμάσεις το Studio σε προσωρινό περιβάλλον πριν από το τελικό merge.
7. Η τελική μεταφορά στο `main` γίνεται **αφού** επιβεβαιωθούν και χειροκίνητα οι ενέργειες του Worker (GET, PUT, 409) και η εμφάνιση πραγματικών βιβλίων/γλωσσαρίου.

### Ανοιχτά θέματα πριν από τελική παραγωγή

- Απαιτείται πραγματικό επιτυχημένο build και πλήρης browser έλεγχος του ενιαίου TipTap bundle. Στο τοπικό περιβάλλον δεν υπήρχε σύνδεση στο npm registry.
- Δεν έχουν επιβεβαιωθεί τα όρια CPU του Cloudflare Worker με τα σημερινά δεδομένα σε δωρεάν λογαριασμό. Προτείνεται δοκιμή πραγματικών GET/PUT σε **δοκιμαστικό repository**, με backup.
- Δεν έχει προστεθεί Cloudflare WAF/rate limiting για αποτυχημένες προσπάθειες σύνδεσης (πρόκειται για ξεχωριστή ρύθμιση λογαριασμού).
- Δεν έχει γίνει πλήρης μετάβαση του localStorage σε IndexedDB.
- Οι σελιδοδείκτες έχουν πλέον σταθερό `chapterId`, αλλά όχι ανθεκτικό κειμενικό offset όταν αλλάζει ριζικά το ίδιο το κείμενο.
- Δεν έχει ενεργοποιηθεί `sandbox` στο iframe του Reader, επειδή αυτό επηρεάζει την τοπική αποθήκευση και απαιτεί προηγουμένως ανασχεδιασμό μέσω postMessage.
- Τα H4–H6 και οι σύνθετοι πίνακες χρειάζονται οπτική δοκιμή σε πραγματικά βιβλία, ιδιαίτερα αν εκτείνονται σε περισσότερες από μία σελίδες.
- Το Studio αποτρέπει κάθε απώλεια references στον έλεγχο δημοσίευσης. Για σκόπιμη αναδόμηση/διαγραφή τους απαιτείται ειδική επιβεβαιωμένη ροή, όχι παράκαμψη του ελέγχου.

## Εκδόσεις

- **2.4.0-rc1 (υποψήφια)** — προστασία δεδομένων, ασφαλές bundle build, regression tests και κοινό README.
- **2.3.2 (προηγούμενη)** — επιδιόρθωση TipTap plugin conflict, ανεπαρκής στην πράξη.
- **2.3.1** — αρχική ενσωμάτωση TipTap και Barnebok.
- **2.3.0** — εμπλουτισμένο περιεχόμενο και νέοι κανόνες σελιδοποίησης.
- **2.2.0** — Hyphenopoly στον Reader.

Δεν δημοσιεύουμε παραγωγική 2.4.0 μέχρι να ολοκληρωθεί ο έλεγχος της υποψήφιας έκδοσης.


## Reader — ασφαλείς σελιδοδείκτες με chapterId (2026-11-07)

- Τα IDs των κεφαλαίων μεταφέρονται πλέον στον ενσωματωμένο Reader, χωρίς μεταβολή του `library-data.json`.
- Νέοι σελιδοδείκτες: `chapterId`, αριθμός κεφαλαίου και σελίδας για fallback, απόσπασμα και εσωτερική άγκυρα.
- Παλαιοί σελιδοδείκτες: μεταφέρονται μόνο όταν το αποθηκευμένο απόσπασμα αντιστοιχεί μοναδικά σε κεφάλαιο. Αν δεν είναι εφικτό, παραμένουν αποθηκευμένοι και επισημαίνονται, χωρίς λανθασμένη πλοήγηση.
- Ενοποιημένος έλεγχος σε κινητό/desktop.
- Το `npm test` περιλαμβάνει το νέο `tests/bookmark-regression.mjs`.
- Αλλαγές: `index.html`, `package.json`, `tests/bookmark-regression.mjs`, `README.md`. Δεν απαιτείται αλλαγή σε admin.html, Worker, δεδομένα ή vendor.
- Το ειδικό regression test εκτελέστηκε επιτυχώς σε Node.js. Δεν έχει επαληθευτεί σε πραγματική κινητή συσκευή.


## Ενίσχυση Worker και έλεγχος συμβατότητας (2026-11-07)

- Το GET του `cloudflare-worker.js` απαντά στην ίδια μορφή `{sha,data}`, χωρίς να κάνει περιττό `JSON.stringify()` του μεγάλου αντικειμένου βιβλιοθήκης. Η απομακρυσμένη JSON μορφή ελέγχεται πριν επιστραφεί.
- Η αυθεντικοποίηση `Bearer`, ο έλεγχος `Origin`, το SHA/409 και ο περιορισμός μεγέθους διατηρούνται αμετάβλητα. Προστέθηκε `X-Content-Type-Options: nosniff`.
- Προστέθηκε `tests/worker-regression.mjs` για GET, PUT, αποτυχημένη αυθεντικοποίηση, CORS, 409 και πλήρη βιβλιοθήκη. Το `npm test` εκτελεί πλέον και αυτό το test.
- **Σημαντικό:** Η αλλαγή του `cloudflare-worker.js` στο GitHub **δεν δημοσιεύει αυτόματα** την αλλαγή στον ενεργό Cloudflare Worker. Πρέπει να εφαρμοστεί χωριστά στο dashboard του Worker (Deploy). Δεν απαιτούνται αλλαγές στα secrets ή στο `admin.html`.
- Το rate limiting γίνεται στην πλευρά του Cloudflare (WAF / Rate limiting rules, ανάλογα με το πλάνο)· δεν έχει ενεργοποιηθεί μέσω αυτού του ZIP. Προτείνεται ειδικός κανόνας για υπερβολικές προσπάθειες στο `/api/library`, με προσεκτική εξαίρεση της κανονικής σύνδεσης.
- Το πραγματικό όριο CPU/μνήμης πρέπει να επιβεβαιωθεί με Workers Logs σε παραγωγή. Τα tests είναι προσομοιωμένα HTTP αιτήματα σε Node.js, όχι Cloudflare runtime.

### Ακριβείς αλλαγές στο main

**Αντικατάσταση:** `cloudflare-worker.js`, `package.json`, `README.md`.

**Προσθήκη:** `tests/worker-regression.mjs` μέσα στον υπάρχοντα φάκελο `tests/`.

**Καμία αλλαγή:** `admin.html`, `index.html`, `library-data.json`, `sw.js`, `vendor/`, `scripts/` και λοιποί φάκελοι.


## Συμπλήρωμα: πολιτική ασφάλειας Reader και τεκμηρίωση (07/11/2026)

- Προστέθηκε στο `index.html` CSP: `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `connect-src 'self'`, `img-src 'self' https: data: blob:`. Δεν περιορίζουμε ακόμη τα inline scripts, ώστε να μη χαλάσει το `srcdoc` του Reader.
- Δεν προστέθηκε iframe `sandbox`, καθώς οι σελιδοδείκτες αποθηκεύονται στο ίδιο origin.
- Νέο `tests/reader-security-regression.mjs` ελέγχει την πολιτική, τις εξαρτήσεις OpenPageFlip/Hyphenopoly και την ευθυγράμμιση εκδόσεων `package.json`–`index.html`–`sw.js`. Το `npm test` περιλαμβάνει τον νέο έλεγχο.
- Η τεκμηρίωση `SETUP-EL.md` περιγράφει το ισχύον Studio, CSP hashes και τις τρέχουσες προϋποθέσεις ασφάλειας.
- Δεν τροποποιήθηκαν αρχεία βιβλίων, Studio, Worker, service worker ή vendor. Δεν έχει τεθεί σε λειτουργία rate limiting.
- Κατά την εγκατάσταση στο `main`, αντικατάστησε **μόνο** `index.html`, `package.json`, `README.md`, `SETUP-EL.md` και πρόσθεσε **μόνο** `tests/reader-security-regression.mjs` στον υπάρχοντα φάκελο `tests`.


## Τοπική ανάκτηση Studio μέσω IndexedDB — 07/11/2026

- Το Studio κρατά την υπάρχουσα συγχρονική αποθήκευση localStorage και επιπλέον καθρεφτίζει τα τοπικά προσχέδια στο IndexedDB με σειριοποιημένες, καθυστερημένες εγγραφές.
- Στη σελίδα «Αντίγραφα ασφαλείας» προστίθεται «Ανάκτηση τοπικού αντιγράφου (IndexedDB)». Προβάλλει ημερομηνία, πλήθος βιβλίων και λημμάτων, ζητά ρητή επιβεβαίωση και εξάγει JSON backup της τρέχουσας κατάστασης πριν αντικαταστήσει **μόνο τα τοπικά** δεδομένα.
- Δεν αποθηκεύονται κωδικοί ή secrets στο IndexedDB. Δεν αλλάζουν Worker API, δημοσίευση SHA/409, γλωσσάρι ή Reader.
- Το IndexedDB είναι **βοηθητικό τοπικό αντίγραφο**, όχι εγγυημένη μόνιμη αποθήκευση και όχι αυτόματη αντικατάσταση του localStorage. Αν το localStorage γεμίσει, η υπάρχουσα προειδοποίηση / ροή προστασίας παραμένει· ο χρήστης πρέπει να κρατήσει εξαγωγή JSON.
- Νέο regression test `tests/idb-recovery-regression.mjs`, συμπεριλαμβανόμενο στο `npm test`. Έλεγχος πραγματικής αποθήκευσης browser/μη δημοσιευμένων αλλαγών σε συσκευή: εκκρεμεί.

### Εγκατάσταση στο main

**Αντικατάσταση:** `admin.html`, `package.json`, `README.md`.
**Προσθήκη:** `tests/idb-recovery-regression.mjs` στον **ήδη υπάρχοντα** φάκελο `tests`.
**Καμία αλλαγή:** `library-data.json`, `index.html`, `sw.js`, `cloudflare-worker.js`, `vendor/`, `scripts/`, τα λοιπά tests και ο Worker στο Cloudflare.


# Authentication rate limiting patch — 2026-11-07

Changes: adds best-effort limiter for **failed** GET/PUT authentication, keyed by Cloudflare-provided CF-Connecting-IP. Correctly authenticated requests are not counted. Each failed attempt invokes the native rate limiter. Limit configuration: 10 attempts / 60 seconds per Cloudflare location. The Cloudflare API is approximate, not an account-wide strict lockout.

## In `main`
- **Replace:** `cloudflare-worker.js`, `package.json`, `README.md`.
- **Add:** `tests/rate-limit-regression.mjs`; `wrangler.ratelimit.example.toml` (reference only; optional and not deployed).
- **No change:** `admin.html`, `index.html`, `library-data.json`, `sw.js`, `vendor/`, other `tests/`, `.github/`.

## Important Cloudflare activation
Updating the GitHub file **does not** update the live Worker. More importantly, **the code alone does not activate rate limiting**: the `AUTH_RATE_LIMITER` binding must be configured in Wrangler with the supplied reference snippet. Native ratelimit bindings are deployed via Wrangler (>= 4.36). Keep the exact existing Worker name, environment variables and secrets; do not deploy the incomplete example as-is. Verify the live binding after deployment. Without it, invalid passwords still return 401, but rate limiting is inactive. Do not report it as active from npm tests alone.

Run `npm test` on complete repository. Regression file mocks the limiter and exercises 401, 429, correct login, CORS and absent-binding compatibility. Actual Cloudflare bindings require live test. 
