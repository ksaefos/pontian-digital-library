# Ποντιακή Ψηφιακή Βιβλιοθήκη 2.1.0 — Οδηγός σύνδεσης

## Πριν αρχίσεις
Κατέβασε το υπάρχον `library-data.json` από το GitHub ως εφεδρικό αντίγραφο. **Μην σβήσεις το υπάρχον repository.**

## Α. Ανέβασμα βιβλιοθήκης
1. Στο αποθετήριο της Ποντιακής Ψηφιακής Βιβλιοθήκης στο GitHub ανέβασε/αντικατάστησε `index.html`, `library-data.json`, `sw.js` και πρόσθεσε `admin.html`, `admin.js`.
2. Μην ανεβάσεις το `cloudflare-worker.js` στο δημόσιο repository αν δεν το χρειάζεσαι: είναι μόνο ο πηγαίος κώδικας Worker (δεν περιέχει κωδικούς).
3. Περίμενε τη δημοσίευση του GitHub Pages και άνοιξε τη βιβλιοθήκη. Τα υπάρχοντα βιβλία θα πρέπει να εμφανίζονται.

## Β. Προσωπικό token GitHub
1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Repository access: Only select repositories → επίλεξε το repository της βιβλιοθήκης.
3. Repository permissions → Contents: Read and write.
4. Επίλεξε λογική διάρκεια ισχύος και αντίγραψε το token μία φορά. **Μη μου στείλεις το token** και μην το επικολλήσεις ποτέ σε αρχείο HTML, GitHub commit ή συνομιλία.

## Γ. Worker Cloudflare
1. Cloudflare Dashboard → Workers & Pages → Create → Worker.
2. Δώσε ένα όνομα όπως `pontian-library-sync`. Δημιούργησέ τον χωρίς Cloudflare Access πάνω στο endpoint, γιατί η σελίδα χρησιμοποιεί δικό της έλεγχο κωδικού. Η πρόσβαση περιορίζεται και μέσα στον Worker.
3. Edit code → επικόλλησε όλο το περιεχόμενο του `cloudflare-worker.js` → Deploy.
4. Settings → Variables and Secrets. Πρόσθεσε *Secrets*:
   - `ADMIN_PASSWORD` = ένας μεγάλος μοναδικός κωδικός διαχείρισης (π.χ. 24+ τυχαίοι χαρακτήρες).
   - `GITHUB_TOKEN` = το fine-grained token GitHub.
5. Πρόσθεσε *Text variables*:
   - `GITHUB_OWNER` = ο λογαριασμός ή ο οργανισμός που κατέχει το repository.
   - `GITHUB_REPO` = το όνομα repository χωρίς URL.
   - `GITHUB_BRANCH` = `main` (ή όποιο branch χρησιμοποιεί το Pages).
   - `ALLOWED_ORIGIN` = η **ακριβής** αρχή URL της βιβλιοθήκης (π.χ. `https://username.github.io` — χωρίς διαδρομή `/repository/` και χωρίς τελική κάθετο). Αν έχεις custom domain, γράψε το custom domain.
6. Save / Deploy και αντέγραψε το HTTPS URL που καταλήγει σε `.workers.dev`.

## Δ. Πρώτη σύνδεση
1. Άνοιξε `https://<η-διεύθυνση-της-βιβλιοθήκης>/admin.html` (ή το αντίστοιχο `/repository/admin.html` για GitHub Pages project site).
2. Στο πεδίο Worker βάλε ολόκληρη τη διεύθυνση `https://...workers.dev`.
3. Στον κωδικό βάλε τον `ADMIN_PASSWORD` που όρισες. Πάτησε «Σύνδεση και φόρτωση».
4. Πάτησε «Λήψη αντιγράφου JSON» πριν από μεγάλες αλλαγές.
5. Άλλαξε δοκιμαστικά το έτος έκδοσης ενός βιβλίου. Πάτησε «Δημοσίευση στο GitHub». Επαλήθευσε πρώτα στο GitHub και έπειτα στη δημόσια βιβλιοθήκη.

## Προσοχή
- Η σελίδα `admin.html` μπορεί να τη δει οποιοσδήποτε, αλλά **δεν επιτρέπεται ανάγνωση ή δημοσίευση μέσω Worker χωρίς κωδικό**. Δεν αποθηκεύουμε κωδικό στον browser.
- Το προτεινόμενο μοντέλο χρησιμοποιεί GitHub ως μοναδική πηγή αλήθειας. Κάθε δημοσίευση είναι commit και μπορεί να ανακληθεί από το ιστορικό.
- Αν εμφανιστεί `409` μην επαναλάβεις χωρίς έλεγχο: κάποιος άλλαξε ήδη το JSON. Κατέβασε πρώτα τις μη δημοσιευμένες αλλαγές σου.
- Το GitHub Pages και το PWA cache ίσως καθυστερήσουν να εμφανίσουν μια αλλαγή. Το `library-data.json` ανακτάται κατά προτεραιότητα από το δίκτυο όταν υπάρχει σύνδεση.
- Εφόσον το περιεχόμενο δημοσιεύεται δημόσια, μη βάζεις ιδιωτικά ή ευαίσθητα στοιχεία στα βιβλία.
