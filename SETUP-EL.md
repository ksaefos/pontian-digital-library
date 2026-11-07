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
