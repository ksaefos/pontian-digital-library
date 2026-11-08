# Εγκατάσταση και έλεγχοι — Pontian Digital Library

Το `admin.html` είναι η μοναδική εφαρμογή διαχείρισης (το παλαιό `admin.js` έχει καταργηθεί).

## Σύνδεση

Η διεύθυνση Worker σχηματίζεται ως `https://pontian-library-sync.<παρατσούκλι>.workers.dev`. Συνδέεστε με τον κωδικό του Worker. Αποφεύγετε τη χρήση δοκιμαστικού Studio με τον παραγωγικό Worker.

## Ασφάλεια δεδομένων

Πριν από αλλαγές κρατήστε το τρέχον `library-data.json` από το GitHub. Ελέγξτε ότι είστε στο σωστό branch. Διατηρήστε backup και πριν από κάθε δημοσίευση.

## Build / CI

Εγκατάσταση: `npm ci`. Κατασκευή: `npm run build`. Έλεγχοι: `npm test` και `npm run test:browser`.

Ο κώδικας Studio περιλαμβάνει inline scripts με CSP hashes. Μετά από ΚΑΘΕ αλλαγή στα scripts του `admin.html`, εκτελέστε `python3 scripts/set-csp.py` και κάντε commit το ενημερωμένο `admin.html`. Το CI αποτυγχάνει εάν λείπουν οι σωστοί hashes.

Το workflow ελέγχει push στο `main` και στο `stabilization-2.4` και Pull Requests προς αυτά. Τα παραγόμενα assets γίνονται commit αυτομάτως μόνο στο staging branch, ποτέ σε PR ή main.

## Δημόσια έκδοση

Το GitHub Pages προβάλλει το `main`. Εργασίες στο `stabilization-2.4` δεν επηρεάζουν άμεσα τη δημόσια έκδοση.

## Πολιτική ασφαλείας Reader

Το `index.html` ορίζει περιορισμένη CSP για αντικείμενα, βάση URL, υποβολές φορμών, αιτήματα δικτύου και εικόνες. Δεν προστίθεται ακόμη `script-src` με hashes, επειδή το ενσωματωμένο `srcdoc` περιέχει εκτελέσιμα scripts. Δεν προστίθεται `sandbox` στο iframe πριν μεταφερθεί η αποθήκευση θέσης ανάγνωσης μέσω `postMessage`. Το νέο regression test διασφαλίζει αυτές τις προϋποθέσεις.

## Έκδοση και αποθετήριο

Η τρέχουσα έκδοση είναι `3.0.0` (οπτικά **v3.0**). Το `package.json` είναι η πηγή της έκδοσης. Κατά την αναβάθμιση πρέπει να συμφωνούν επίσης τα δύο πεδία έκδοσης του `package-lock.json` και η σταθερά `PDL_APP_VERSION` στο `index.html`. Το `npm run build` ελέγχει αυτές τις τιμές και ενημερώνει αυτόματα το όνομα cache στο `sw.js` ως `pontian-digital-library-v<έκδοση>-<hash>`. Το `tests/reader-security-regression.mjs` επαληθεύει τη συμβατότητα. Επειδή το CI δεν κάνει commit τα παραγόμενα αρχεία στο `main`, κάθε αλλαγή στα αρχεία build απαιτεί και έλεγχο/δημοσίευση του παραγόμενου `sw.js` στο `main`.

Εκτελέστε `npm test` πριν από κάθε παράδοση. Η επιτυχία των tests δεν υποκαθιστά έλεγχο σε πραγματικό browser και έλεγχο σύνδεσης/δημοσίευσης του Cloudflare Worker.
