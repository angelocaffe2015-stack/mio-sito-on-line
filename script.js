import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, onSnapshot, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Costanti e Variabili di Stato
const ADMIN_EMAIL = "spinelli291082@gmail.com";
const EMAILJS_SERVICE = "service_6lxgcf8";
const EMAILJS_TEMPLATE = "template_detokx1";
const STATO_KEY = 'statoCaricamentoFile';
let filialeAttiva = "centro";
let stanzaCorrente = null;

// 1. PONTE ANDROID PER SCARICARE GLI EXCEL
window.scaricaExcelCompatibile = function(workbook, nomeFile) {
    if (window.AndroidApp && typeof window.AndroidApp.salvaFileExcel === 'function') {
        const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        window.AndroidApp.salvaFileExcel(nomeFile, base64);
    } else {
        XLSX.writeFile(workbook, nomeFile);
    }
};

// 2. PONTE ANDROID PER LE STAMPE
const originalPrint = window.print;
window.print = function() {
    if (window.AndroidApp && typeof window.AndroidApp.avviaStampaAndroid === 'function') {
        window.AndroidApp.avviaStampaAndroid(); // Manda l'ordine alla stampante del cellulare
    } else {
        originalPrint(); // Comportamento normale al PC
    }
};

// Configurazione Firebase Firestore (Mappe)
// Nota: firebaseConfig è stato definito nell'HTML, ma in un modulo isolato conviene passarlo o leggerlo. 
// Poiché l'hai già inizializzato globalmente in v8, qui lo re-inizializziamo per la v10 (Firestore/Auth).

const firebaseConfig = {
    apiKey: "AIzaSyAH1s2mY5y_qXTjh2Es7k9uLEZAJjWIB3U",
    authDomain: "micentro-box-61a9a.firebaseapp.com",
    databaseURL: "https://micentro-box-61a9a-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "micentro-box-61a9a",
    storageBucket: "micentro-box-61a9a.firebasestorage.app",
    messagingSenderId: "619510975669",
    appId: "1:619510975669:web:99404ef60e375961fa82fc"
};
const app = initializeApp(firebaseConfig); 
const db = getFirestore(app);
const auth = getAuth(app);
let unsubscribeSession = null;

// ==========================================
// 1. ASCOLTO FIRESTORE (Mappa e Stanze)
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        const emailUser = user.email ? user.email.trim().toLowerCase() : "";

        // ========================================================
        // 🛑 BLOCCO VISIBILITÀ "GESTIONE DEBITORI"
        // ========================================================
        const utentiSenzaDebitori = [
            "gdesogus@easybox.it",
            // "altro.utente@easybox.it",
        ];

        const btnDebitori = document.getElementById('btn-gestione-debitori');
        if (btnDebitori) {
            if (utentiSenzaDebitori.includes(emailUser)) {
                btnDebitori.style.display = 'none';
            } else {
                btnDebitori.style.display = 'inline-block';
            }
        }

        // A. SE È L'AMMINISTRATORE: Bypassa totalmente il controllo sessione
        if (emailUser === ADMIN_EMAIL.trim().toLowerCase()) {
            document.getElementById('schermata-login').style.display = 'none';
            if (typeof window.sbloccaInterfacciaAdmin === "function") window.sbloccaInterfacciaAdmin();
        }
        // B. SE È UN UTENTE NORMALE: Attiva il controllo multi-dispositivo
        else {
            const userRef = doc(db, "utenti", user.uid);
            unsubscribeSession = onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                    const dbSession = docSnap.data().sessioneAttiva;
                    const localSession = localStorage.getItem('token_sessione');
                    if (dbSession && dbSession !== localSession) {
                        alert("Accesso rilevato da un altro dispositivo. Verrai disconnesso.");
                        if (typeof window.eseguiLogout === "function") window.eseguiLogout();
                    }
                }
            });
        }

        // C. Ascolto Stanze in Tempo Reale (Per tutti)
        onSnapshot(collection(db, "stanze"), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const idStanza = change.doc.id;
                const stanzaElement = document.getElementById(idStanza);
                if (!stanzaElement) return;

                const data = change.doc.data();
                stanzaElement.classList.remove('occupata', 'debitore', 'company', 'damaged', 'maintenance', 'movein', 'held', 'in-ritardo');

                if (data.stato && data.stato !== "") stanzaElement.classList.add(data.stato);

                stanzaElement.setAttribute('data-f', data.datoF !== undefined ? data.datoF : '');
                stanzaElement.setAttribute('data-dapulire', data.daPulire === true ? 'true' : 'false');
                stanzaElement.setAttribute('data-cliente', data.cliente !== undefined ? data.cliente : '');
                stanzaElement.setAttribute('data-partenza', data.dataPartenza !== undefined ? data.dataPartenza : '');
                stanzaElement.setAttribute('data-nota-fissa', data.notaFissa !== undefined ? data.notaFissa : '');
                stanzaElement.setAttribute('data-nota-cliente', data.notaCliente !== undefined ? data.notaCliente : (data.nota !== undefined ? data.nota : ''));

                if (typeof window.gestisciSimboloPulizia === "function") {
                    window.gestisciSimboloPulizia(stanzaElement, data.daPulire === true);
                }

                // GESTIONE LUCCHETTO LONG TERM
                const numStanzaPuro = idStanza.replace('stanza-centro-', '');
                if (typeof window.gestisciLucchetto === "function") {
                    window.gestisciLucchetto(numStanzaPuro, (data.stato === "debitore" && data.isLongTerm === true));
                }
            });
        });
    } else {
        const schermataLogin = document.getElementById('schermata-login'); if (schermataLogin) schermataLogin.style.display = 'flex';
        if (unsubscribeSession) unsubscribeSession();
    }
});

// ==========================================
// 2. AUTENTICAZIONE E SESSIONE
// ==========================================
window.eseguiRegistrazione = function () {
    const nomeInput = document.getElementById('nome-registrazione');
    const emailInput = document.getElementById('email-registrazione');
    const passwordInput = document.getElementById('password-registrazione');
    const privacyCheckbox = document.getElementById('privacy-registrazione');
    const nome = nomeInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!nome || !email || !password) {
        alert("Compila tutti i campi!");
        return;
    }

    if (!privacyCheckbox.checked) {
        alert("Per poterti registrare, devi leggere e accettare l'Informativa sulla Privacy.");
        return;
    }

    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const emailKey = email.toLowerCase().replace(/\./g, '_');

            return firebase.database().ref('utenti/' + emailKey).set({
                nome: nome,
                email: email.toLowerCase(),
                stato: 'pending',
                otp: null,
                dataRegistrazione: new Date().toLocaleString()
            });
        })
        .then(() => {
            return firebase.auth().signOut();
        })
        .then(() => {
            // === INVIO MAIL DI AVVISO REGISTRAZIONE ALL'ADMIN ===
            const templateParamsReg = {
                to_name: nome,
                to_email: email,
                user_email: email,
                data_registrazione: new Date().toLocaleString('it-IT')
            };
            emailjs.send(EMAILJS_SERVICE, "template_ux6ifw8", templateParamsReg)
                .then(() => console.log("Notifica di registrazione inviata!"))
                .catch((err) => console.error("Errore invio notifica:", err));

            alert("Account creato con successo! Sei in attesa di verifica.");

            const schermataLogin = document.getElementById('schermata-login');
            if (schermataLogin) schermataLogin.style.display = 'flex';

            document.getElementById('box-registrazione').style.display = 'none';
            const boxLogin = document.getElementById('box-login');
            if (boxLogin) boxLogin.style.display = 'none';

            const boxOtp = document.getElementById('box-otp');
            if (boxOtp) boxOtp.style.display = 'block';

            window.tempEmailUtente = email.toLowerCase();

            nomeInput.value = '';
            emailInput.value = '';
            passwordInput.value = '';
        })
        .catch((error) => {
            alert("Errore durante la registrazione: " + error.message);
            console.error("Errore registrazione:", error);
        });
};

window.eseguiLogin = function () {
    const emailInput = document.getElementById('email-login');
    const passwordInput = document.getElementById('password-login');
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const erroreElement = document.getElementById('errore-login');

    if (erroreElement) erroreElement.style.display = 'none';
    if (!email || !password) { alert("Inserisci sia l'email che la password!"); return; }

    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            if (user.email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase()) {
                document.getElementById('schermata-login').style.display = 'none';
                alert("Benvenuto Amministratore!");
                if (typeof window.sbloccaInterfacciaAdmin === "function") window.sbloccaInterfacciaAdmin();
                window.registraSessioneUtente(user.email);
                return;
            }

            const emailKey = user.email.toLowerCase().replace(/\./g, '_');
            firebase.database().ref('utenti/' + emailKey).once('value').then((snapshot) => {
                const userData = snapshot.val();
                if (!userData || userData.stato === 'pending') {
                    alert("Account in attesa di verifica. Inserisci il codice OTP ricevuto via email.");
                    document.getElementById('box-login').style.display = 'none';
                    document.getElementById('box-otp').style.display = 'block';
                    window.tempEmailUtente = user.email.toLowerCase();
                } else if (userData.stato === 'attivo') {
                    document.getElementById('schermata-login').style.display = 'none';
                    alert("Accesso eseguito con successo!");
                    window.registraSessioneUtente(user.email);
                }
            });
        })
        .catch((error) => {
            if (erroreElement) {
                erroreElement.innerText = "Accesso negato. Controlla le credenziali.";
                erroreElement.style.display = 'block';
            } else { alert("Errore di accesso: " + error.message); }
        });
};

window.verificaOTP = function () {
    const codiceInserito = document.getElementById('input-otp').value.trim();
    if (!codiceInserito) { alert("Inserisci il codice OTP!"); return; }

    const email = window.tempEmailUtente;
    if (!email) { alert("Sessione non valida. Riscrivi email e password."); location.reload(); return; }

    const emailKey = email.toLowerCase().replace(/\./g, '_');
    firebase.database().ref('utenti/' + emailKey).once('value').then((snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.otp === codiceInserito) {
            firebase.database().ref('utenti/' + emailKey).update({ stato: 'attivo', otp: null }).then(() => {
                alert("Codice verificato con successo! Accesso consentito.");
                document.getElementById('box-otp').style.display = 'none';
                window.registraSessioneUtente(email);
            });
        } else { alert("Codice OTP errato. Riprova."); }
    });
};

window.eseguiLogout = function () {
    const user = firebase.auth().currentUser;
    if (user) {
        const emailKey = user.email.trim().toLowerCase().replace(/\./g, '_');
        firebase.database().ref('sessioni_attive/' + emailKey).remove()
            .then(() => firebase.auth().signOut())
            .then(() => location.reload());
    } else {
        firebase.auth().signOut().then(() => location.reload());
    }
};

window.registraSessioneUtente = function (email) {
    if (!email) return;
    const emailPulita = email.trim().toLowerCase();
    firebase.database().ref('log_accessi').push({ email: emailPulita, loginTime: new Date().toLocaleString(), logoutTime: "" });
    if (emailPulita === ADMIN_EMAIL.trim().toLowerCase()) return;

    const sessionId = Math.random().toString(36).substr(2, 9);
    const emailKey = emailPulita.replace(/\./g, '_');
    const userRef = firebase.database().ref('sessioni_attive/' + emailKey);

    userRef.off();
    userRef.set({ session: sessionId }).then(() => {
        userRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.session !== sessionId) {
                alert("Accesso rilevato da un altro dispositivo. Verrai disconnesso.");
                userRef.off();
                window.eseguiLogout();
            }
        });
    });
};

// ==========================================
// 3. PANNELLO AMMINISTRATORE E RESET
// ==========================================

window.sbloccaInterfacciaAdmin = function () {
    document.getElementById('schermata-login').style.display = 'none';
    const btnAdmin = document.getElementById('btn-admin');
    const btnCaricaMappe = document.getElementById('btn-carica-mappe');
    const btnResetDati = document.getElementById('btn-reset-dati');

    if (btnAdmin) btnAdmin.classList.remove('nascosto');
    if (btnCaricaMappe) btnCaricaMappe.classList.remove('nascosto');
    if (btnResetDati) btnResetDati.classList.remove('nascosto');
};

window.toggleAdminPanel = function () {
    const modal = document.getElementById('modal-admin');
    if (!modal) return;
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
    if (modal.style.display === 'flex') {
        if (typeof window.caricaRichiesteOTP === 'function') window.caricaRichiesteOTP();
        if (typeof window.caricaLogAccessi === 'function') window.caricaLogAccessi();
    }
};

window.togglePannelloMappe = function () {
    const panel = document.getElementById('pannello-admin');
    if (panel) {
        panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
    }
};

window.resetDatiStanze = async function () {
    const conferma = prompt("⚠️ ATTENZIONE! Stai per svuotare TUTTI i box.\nVerranno eliminati clienti, stati, date, task e pulizie.\nRimarranno intatte solo le 'Note Fisse'.\n\nPer confermare l'operazione, digita esattamente: RESET");

    if (conferma !== "RESET") {
        alert("Operazione annullata. Nessun dato è stato modificato.");
        return;
    }

    try {
        const stanzeRef = collection(db, "stanze");
        const snapshot = await getDocs(stanzeRef);
        let contatore = 0;
        const promesse = [];

        snapshot.forEach(docSnap => {
            const docRef = doc(db, "stanze", docSnap.id);
            const updateData = {
                stato: "",
                cliente: "",
                dataPartenza: "",
                notaCliente: "",
                daPulire: false,
                richiestaSblocco: false,
                taskMoveout: null,
                taskBlocca: null,
                taskSblocca: null,
                datoF: ""
            };
            promesse.push(setDoc(docRef, updateData, { merge: true }));
            contatore++;
        });

        await Promise.all(promesse);
        alert(`✅ Reset completato con successo!\n${contatore} stanze sono state ripulite.`);

        if (typeof window.aggiornaToDo === 'function') window.aggiornaToDo();

    } catch (error) {
        console.error("Errore critico durante il reset:", error);
        alert("Si è verificato un errore durante il reset dei dati. Controlla la console.");
    }
};

window.inviaOTPaUtente = function (emailUtente, nomeUtente) {
    const codiceOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const templateParams = { to_email: emailUtente, to_name: nomeUtente, otp_code: codiceOTP, reply_to: ADMIN_EMAIL };
    emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, templateParams).then(function () {
        alert("OTP inviato con successo a " + emailUtente);
        const emailKey = emailUtente.toLowerCase().replace(/\./g, '_');
        firebase.database().ref('utenti/' + emailKey).update({ otp: codiceOTP });
    }, function (error) { alert("Errore invio email."); console.error(error); });
};

window.caricaRichiesteOTP = function () {
    const listaOTP = document.getElementById('lista-richieste-otp');
    if (!listaOTP) return;
    listaOTP.innerHTML = '<p>Ricerca utenti in attesa...</p>';

    firebase.database().ref('utenti').orderByChild('stato').equalTo('pending').once('value').then((snapshot) => {
        listaOTP.innerHTML = '';
        if (!snapshot.exists()) { listaOTP.innerHTML = '<p style="color: #28a745;">Nessuna richiesta in attesa.</p>'; return; }

        snapshot.forEach((childSnapshot) => {
            const utente = childSnapshot.val();
            const div = document.createElement('div');
            div.style.padding = '15px'; div.style.border = '1px solid #ddd'; div.style.marginBottom = '10px'; div.style.background = '#f8f9fa';
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div><strong>${utente.nome}</strong><br><span style="color: #007bff;">${utente.email}</span></div>
                    <button onclick="window.inviaOTPaUtente('${utente.email}', '${utente.nome.replace(/'/g, "\\'")}')" class="btn-azione">📧 Invia OTP</button>
                </div>`;
            listaOTP.appendChild(div);
        });
    });
};

window.caricaLogAccessi = function () {
    const listaLog = document.getElementById('lista-log-accessi');
    if (!listaLog) return;
    firebase.database().ref('log_accessi').limitToLast(20).once('value').then((snapshot) => {
        listaLog.innerHTML = '';
        if (!snapshot.exists()) { listaLog.innerHTML = '<p>Nessun accesso.</p>'; return; }
        const accessi = []; snapshot.forEach((child) => { accessi.unshift(child.val()); });
        accessi.forEach((log) => {
            const div = document.createElement('div');
            div.style.padding = '8px'; div.style.borderBottom = '1px solid #eee'; div.style.fontSize = '13px';
            let statoUscita = log.logoutTime ? `<span style="color: #dc3545;">Out: ${log.logoutTime}</span>` : `<span style="color: #28a745; font-weight: bold;">Online</span>`;
            div.innerHTML = `<strong>${log.email}</strong><br><span style="color: #666;">In: ${log.loginTime}</span> | ${statoUscita}`;
            listaLog.appendChild(div);
        });
    });
};

// ==========================================
// 4. RICERCA E PATHFINDING MAPPE
// ==========================================
const PUNTI_INGRESSO = {
    'map-centro-p-4': { x: 649, y: 480, assePartenza: 'x' },
    'map-centro-p-3': { x: 659, y: 386, assePartenza: 'y' },
    'map-centro-p-2': { x: 1269, y: 701, assePartenza: 'y' },
    'map-centro-p1': { x: 561, y: 890, assePartenza: 'y' },
    'map-centro-p-1': { x: 415, y: 669, assePartenza: 'y' },
    'map-centro-pt': { x: 897, y: 264, assePartenza: 'y' }
};

window.cercaETracciaStanza = function () {
    const query = document.getElementById('input-stanza').value.trim();
    const risultato = document.getElementById('risultato-ricerca');

    document.querySelectorAll('.linea-percorso').forEach(el => el.remove());
    document.querySelectorAll('.omino-animato').forEach(el => el.remove());
    document.querySelectorAll('.stanza-evidenziata').forEach(el => el.classList.remove('stanza-evidenziata'));

    if (!query) {
        if (risultato) risultato.innerHTML = "<span style='color:red;'>Inserisci un numero di stanza.</span>";
        return;
    }

    const stanza = document.querySelector(`.stanza[data-nome="${query}"]`) || document.getElementById(`stanza-centro-${query}`);

    if (!stanza) {
        if (risultato) risultato.innerHTML = `<span style='color:red;'>Stanza <strong>${query}</strong> non trovata.</span>`;
        return;
    }

    const contenitorePiano = stanza.closest('.container-mappa');
    const idPiano = contenitorePiano.id;

    const NOMI_PIANI = {
        'map-centro-p-4': 'Piano -4', 'map-centro-p-3': 'Piano -3',
        'map-centro-p-2': 'Piano -2', 'map-centro-p-1': 'Piano -1',
        'map-centro-pt': 'Piano Terra', 'map-centro-p1': 'Piano Primo'
    };
    if (risultato) risultato.innerHTML = `Stanza <strong>${query}</strong> trovata al <strong>${NOMI_PIANI[idPiano] || idPiano}</strong>!`;

    document.querySelectorAll('.container-mappa').forEach(map => {
        map.style.display = 'none';
        map.classList.remove('attiva');
    });
    contenitorePiano.style.display = 'block';
    contenitorePiano.classList.add('attiva');

    stanza.style.setProperty('fill', '#fffc33', 'important');
    stanza.style.setProperty('stroke', '#ff0000', 'important');
    stanza.style.setProperty('stroke-width', '4px', 'important');
    stanza.classList.add('stanza-evidenziata');

    const svg = contenitorePiano.querySelector('svg');
    const linea = document.createElementNS("http://www.w3.org/2000/svg", "polyline");

    const ingresso = PUNTI_INGRESSO[idPiano] || { x: 0, y: 0, assePartenza: 'y' };

    const stanzaX = parseFloat(stanza.getAttribute('x')) + (parseFloat(stanza.getAttribute('width')) / 2);
    const stanzaY = parseFloat(stanza.getAttribute('y')) + (parseFloat(stanza.getAttribute('height')) / 2);
    const nodoX = stanza.getAttribute('data-nodo-x');
    const nodoY = stanza.getAttribute('data-nodo-y');

    const targetX = parseFloat(nodoX || stanzaX);
    const targetY = parseFloat(nodoY || stanzaY);

    let waypointsDaUsare = ingresso.waypoints ? [...ingresso.waypoints] : [];
    let puntiPercorso = `${ingresso.x},${ingresso.y} `;
    let coordAttualeX = ingresso.x;
    let coordAttualeY = ingresso.y;

    if (idPiano === 'map-centro-p-4') {
        const startX = 649;
        waypointsDaUsare = [{ x: startX, y: ingresso.y }];

        if (Math.abs(targetX - startX) < 20) {
            waypointsDaUsare.push({ x: startX, y: targetY });
            waypointsDaUsare.push({ x: targetX, y: targetY });
        } else if (targetY < 130) {
            waypointsDaUsare.push({ x: startX, y: 174 });
            waypointsDaUsare.push({ x: 713, y: 174 });
            waypointsDaUsare.push({ x: 714, y: 91 });
            if (targetX < 714) {
                waypointsDaUsare.push({ x: Math.max(targetX, 18), y: 91 });
                if (targetX <= 35) waypointsDaUsare.push({ x: 18, y: targetY });
            }
            waypointsDaUsare.push({ x: targetX, y: targetY });
        } else if (targetY >= 130 && targetY < 220) {
            waypointsDaUsare.push({ x: startX, y: 174 });
            if (targetX > startX) {
                waypointsDaUsare.push({ x: Math.min(targetX, 713), y: 174 });
            } else {
                waypointsDaUsare.push({ x: Math.max(targetX, 25), y: 174 });
                if (targetX <= 35) {
                    waypointsDaUsare.push({ x: 18, y: 174 });
                    waypointsDaUsare.push({ x: 18, y: targetY });
                }
            }
            waypointsDaUsare.push({ x: targetX, y: targetY });
        } else {
            waypointsDaUsare.push({ x: startX, y: 274 });
            if (targetX < startX) {
                waypointsDaUsare.push({ x: Math.max(targetX, 24), y: 274 });
                if (targetX <= 35) {
                    waypointsDaUsare.push({ x: 18, y: 274 });
                    waypointsDaUsare.push({ x: 18, y: targetY });
                }
            } else if (targetX > startX) {
                waypointsDaUsare.push({ x: targetX, y: 274 });
            }
            waypointsDaUsare.push({ x: targetX, y: targetY });
        }
    }
    else if (idPiano === 'map-centro-p-3' || idPiano === 'map-centro-p-2') {
        waypointsDaUsare = [{ x: ingresso.x, y: ingresso.y }];
        let yCorridoio = targetY;
        if (nodoY) {
            yCorridoio = parseFloat(nodoY);
        } else if (idPiano === 'map-centro-p-3') {
            if (targetY < 160) yCorridoio = 100;       
            else if (targetY < 280) yCorridoio = 220;  
            else yCorridoio = 330;                     
        }
        waypointsDaUsare.push({ x: ingresso.x, y: yCorridoio }); 
        waypointsDaUsare.push({ x: targetX, y: yCorridoio });    
        waypointsDaUsare.push({ x: targetX, y: targetY });       
    }
    else if (idPiano === 'map-centro-p1') {
        const spineX = 655;
        const spineSx = 183;
        const yCorrBase = 790;
        const yCorrB = 676;
        const yCorrA = 501;
        const yCorrC = 324;
        const yCorrF = 308;
        const yCorrD = 214;
        const yCorrE = 130;

        waypointsDaUsare = [{ x: ingresso.x, y: ingresso.y }];

        if (targetX < spineX) {
            waypointsDaUsare.push({ x: 437, y: 870 });
            waypointsDaUsare.push({ x: 437, y: yCorrBase });
        } else {
            waypointsDaUsare.push({ x: 693, y: 885 });
            waypointsDaUsare.push({ x: 693, y: yCorrBase });
        }

        let activeSpine = (targetX < 430) ? spineSx : spineX;

        if (targetY > 730) {
            waypointsDaUsare.push({ x: targetX, y: yCorrBase });
            waypointsDaUsare.push({ x: targetX, y: targetY });
        } else if (targetY > 580) {
            waypointsDaUsare.push({ x: activeSpine, y: yCorrBase });
            waypointsDaUsare.push({ x: activeSpine, y: yCorrB });
            waypointsDaUsare.push({ x: targetX, y: yCorrB });
            waypointsDaUsare.push({ x: targetX, y: targetY });
        } else if (targetY > 400) {
            waypointsDaUsare.push({ x: activeSpine, y: yCorrBase });
            waypointsDaUsare.push({ x: activeSpine, y: yCorrA });
            if (targetX > 800 && targetY < 490) {
                waypointsDaUsare.push({ x: 980, y: yCorrA });
                waypointsDaUsare.push({ x: 980, y: 396 });
                if (targetX > 1100) {
                    waypointsDaUsare.push({ x: 1156, y: 396 });
                    waypointsDaUsare.push({ x: 1156, y: targetY });
                } else if (targetX > 1000) {
                    waypointsDaUsare.push({ x: 1044, y: 396 });
                    waypointsDaUsare.push({ x: 1044, y: targetY });
                } else {
                    waypointsDaUsare.push({ x: 980, y: targetY });
                }
                if (Math.abs(targetX - waypointsDaUsare[waypointsDaUsare.length - 1].x) > 5) {
                    waypointsDaUsare.push({ x: targetX, y: targetY });
                }
            } else {
                waypointsDaUsare.push({ x: targetX, y: yCorrA });
                waypointsDaUsare.push({ x: targetX, y: targetY });
            }
        } else if (targetY > 260) {
            const yCorr = (targetX < spineX) ? yCorrC : yCorrF;
            waypointsDaUsare.push({ x: activeSpine, y: yCorrBase });
            waypointsDaUsare.push({ x: activeSpine, y: yCorr });
            waypointsDaUsare.push({ x: targetX, y: yCorr });
            waypointsDaUsare.push({ x: targetX, y: targetY });
        } else if (targetY > 170 && targetX < spineX) {
            waypointsDaUsare.push({ x: activeSpine, y: yCorrBase });
            waypointsDaUsare.push({ x: activeSpine, y: yCorrD });
            waypointsDaUsare.push({ x: targetX, y: yCorrD });
            waypointsDaUsare.push({ x: targetX, y: targetY });
        } else {
            waypointsDaUsare.push({ x: activeSpine, y: yCorrBase });
            waypointsDaUsare.push({ x: activeSpine, y: yCorrE });
            let limitX = targetX > 1044 ? 1044 : targetX;
            waypointsDaUsare.push({ x: limitX, y: yCorrE });
            if (targetX > 1044) {
                waypointsDaUsare.push({ x: limitX, y: targetY });
                waypointsDaUsare.push({ x: targetX, y: targetY });
            } else {
                waypointsDaUsare.push({ x: targetX, y: targetY });
            }
        }
    }
    else if (idPiano === 'map-centro-pt') {
        if (targetX >= 850) {
            waypointsDaUsare = [{ x: 875, y: ingresso.y }, { x: 875, y: targetY }];
        } else if (targetX >= 740 && targetY <= 280) {
            waypointsDaUsare = [{ x: targetX, y: ingresso.y }];
        } else {
            let trunkY;
            const actualTrunkX = (targetY < 210) ? 757 : 875;
            if (targetY < 210) trunkY = 100;
            else if (targetY < 400) trunkY = 320;
            else if (targetY >= 570 && targetX > 330) trunkY = 635;
            else trunkY = 495;

            waypointsDaUsare = [
                { x: actualTrunkX, y: ingresso.y },
                { x: actualTrunkX, y: trunkY }
            ];
            if (Math.abs(targetY - trunkY) > 35) {
                waypointsDaUsare.push({ x: targetX, y: trunkY });
            }
        }
    }
    else if (idPiano === 'map-centro-p-1') {
        waypointsDaUsare = [{ x: ingresso.x, y: ingresso.y }, { x: 519, y: 673 }];

        if (targetX > 519) {
            if (targetX >= 700) {
                waypointsDaUsare.push({ x: 767, y: 664 });
                if (targetY < 600) {
                    waypointsDaUsare.push({ x: 770, y: Math.max(targetY, 29) });
                    if (targetY <= 50 && targetX < 765) waypointsDaUsare.push({ x: targetX, y: 29 });
                }
                waypointsDaUsare.push({ x: targetX, y: targetY });
            } else if (targetX >= 540 && targetX < 700 && targetY < 600) {
                waypointsDaUsare.push({ x: 573, y: 678 });
                waypointsDaUsare.push({ x: 573, y: targetY });
                waypointsDaUsare.push({ x: targetX, y: targetY });
            } else {
                waypointsDaUsare.push({ x: targetX, y: 668 });
                waypointsDaUsare.push({ x: targetX, y: targetY });
            }
        } else {
            waypointsDaUsare.push({ x: 516, y: 634 });
            if (targetX >= 310 && targetX <= 519) {
                waypointsDaUsare.push({ x: 368, y: 625 });
                if (targetY < 580) waypointsDaUsare.push({ x: 377, y: Math.max(targetY, 29) });
                waypointsDaUsare.push({ x: targetX, y: targetY });
            } else if (targetX >= 200 && targetX < 310) {
                waypointsDaUsare.push({ x: 369, y: 627 });
                waypointsDaUsare.push({ x: 250, y: 615 });
                if (targetY < 580) waypointsDaUsare.push({ x: 247, y: Math.max(targetY, 251) });
                waypointsDaUsare.push({ x: targetX, y: targetY });
            } else {
                waypointsDaUsare.push({ x: 369, y: 627 });
                waypointsDaUsare.push({ x: 157, y: 613 });
                if (targetY > 630) {
                    waypointsDaUsare.push({ x: 157, y: 746 });
                    if (targetX > 157) waypointsDaUsare.push({ x: targetX, y: 746 });
                } else {
                    waypointsDaUsare.push({ x: 157, y: Math.max(targetY, 100) });
                    if (targetY <= 120) waypointsDaUsare.push({ x: targetX, y: 95 });
                }
                waypointsDaUsare.push({ x: targetX, y: targetY });
            }
        }
    }
    else if (nodoX) {
        if (targetX > ingresso.x && ingresso.waypointsDestra) {
            waypointsDaUsare = ingresso.waypointsDestra;
        } else if (targetX <= ingresso.x && ingresso.waypointsSinistra) {
            waypointsDaUsare = ingresso.waypointsSinistra;
        }
    }

    if (waypointsDaUsare.length > 0) {
        waypointsDaUsare.forEach(wp => {
            puntiPercorso += `${wp.x},${wp.y} `;
            coordAttualeX = wp.x;
            coordAttualeY = wp.y;
        });
    }

    if (nodoX && nodoY) {
        if (ingresso.assePartenza === 'x') {
            puntiPercorso += `${nodoX},${coordAttualeY} ${nodoX},${nodoY}`;
        } else {
            puntiPercorso += `${coordAttualeX},${nodoY} ${nodoX},${nodoY}`;
        }
    } else {
        puntiPercorso += `${coordAttualeX},${stanzaY} ${stanzaX},${stanzaY}`;
    }

    linea.setAttribute("points", puntiPercorso.trim());
    linea.setAttribute("class", "linea-percorso");
    linea.setAttribute("fill", "none");
    linea.setAttribute("stroke", "#ff0000");
    linea.setAttribute("stroke-width", "3");
    svg.appendChild(linea);

    const pathString = "M " + puntiPercorso.trim().replace(/\s+/g, " L ");
    const omino = document.createElementNS("http://www.w3.org/2000/svg", "text");
    omino.setAttribute("font-size", "28");
    omino.setAttribute("text-anchor", "middle");
    omino.setAttribute("dominant-baseline", "middle");
    omino.textContent = "🐈";
    omino.setAttribute("class", "omino-animato");

    const animazione = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
    animazione.setAttribute("dur", "8s");
    animazione.setAttribute("repeatCount", "indefinite");
    animazione.setAttribute("path", pathString);

    omino.style.transformBox = "fill-box";
    omino.style.transformOrigin = "center center";

    omino.appendChild(animazione);
    svg.appendChild(omino);

    contenitorePiano.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ==========================================
// RICERCA STANZE LIBERE
// ==========================================
window.cercaStanzeLibere = function () {
    const inputMq = document.getElementById('input-ricerca-mq');
    const filtroMq = inputMq && inputMq.value ? parseFloat(inputMq.value.replace(',', '.')) : 0;
    const divRisultati = document.getElementById('risultati-ricerca');

    document.querySelectorAll('.stanza').forEach(el => {
        el.style.removeProperty('fill');
        el.style.removeProperty('stroke');
        el.style.removeProperty('stroke-width');
    });

    const stanze = document.querySelectorAll('.stanza');
    let stanzeTrovate = [];

    const mappePiani = {
        'map-centro-p-4': 'Piano -4', 'map-centro-p-3': 'Piano -3',
        'map-centro-p-2': 'Piano -2', 'map-centro-p-1': 'Piano -1',
        'map-centro-pt': 'Piano Terra', 'map-centro-p1': 'Piano 1'
    };

    stanze.forEach(stanza => {
        const eOccupata = stanza.classList.contains('occupata') ||
            stanza.classList.contains('debitore') ||
            stanza.classList.contains('company') ||
            stanza.classList.contains('held') ||
            stanza.classList.contains('damaged') ||
            stanza.classList.contains('maintenance') ||
            stanza.classList.contains('movein');

        if (!eOccupata) {
            const mq = parseFloat(stanza.getAttribute('data-mq')) || 0;

            if (filtroMq === 0 || mq === filtroMq) {
                const numStanza = stanza.getAttribute('data-nome') || stanza.id.replace('stanza-centro-', '');
                const contenitorePiano = stanza.closest('.container-mappa');
                const nomePiano = contenitorePiano ? mappePiani[contenitorePiano.id] || "Piano" : "Sconosciuto";

                const notaFissa = (stanza.getAttribute('data-nota-fissa') || "").trim();
                const notaCliente = (stanza.getAttribute('data-nota-cliente') || "").trim();
                const haNotaFissa = notaFissa !== "";

                const notaDisplay = haNotaFissa ? notaFissa : (notaCliente !== "" ? notaCliente : "Nessuna nota");

                stanzeTrovate.push({
                    num: numStanza, piano: nomePiano, mq: mq,
                    idMappa: contenitorePiano ? contenitorePiano.id : '',
                    nota: notaDisplay,
                    haProblemi: haNotaFissa
                });
            }
        }
    });

    if (divRisultati) {
        if (stanzeTrovate.length > 0) {
            stanzeTrovate.sort((a, b) => a.num.localeCompare(b.num));

            let htmlLista = `<strong style="color: #28a745; display:block; margin-bottom: 10px;">✅ Trovate ${stanzeTrovate.length} stanze libere da ${filtroMq} Mq:</strong>`;
            htmlLista += `<ul style="list-style-type: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;">`;

            stanzeTrovate.forEach(s => {
                const bgDefault = s.haProblemi ? '#fff3cd' : '#f8f9fa';
                const borderDefault = s.haProblemi ? '#ffeeba' : '#ced4da';
                const bgHover = s.haProblemi ? '#ffe8a1' : '#e2e6ea';
                const borderHover = s.haProblemi ? '#ffc107' : '#007bff';
                const coloreTesto = s.haProblemi ? '#d9534f' : '#555';
                const prefissoNota = s.haProblemi ? '⚠️ <strong>ATTENZIONE:</strong> ' : '📝 Note: ';

                htmlLista += `
                <li onclick="selezionaDallaLista('${s.num}', '${s.idMappa}')" 
                    style="background: ${bgDefault}; border: 1px solid ${borderDefault}; padding: 10px; border-radius: 6px; cursor: pointer; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" 
                    onmouseover="this.style.background='${bgHover}'; this.style.borderColor='${borderHover}';" 
                    onmouseout="this.style.background='${bgDefault}'; this.style.borderColor='${borderDefault}';">
                    <div style="display: flex; justify-content: space-between; font-weight: bold; color: #007bff; font-size: 14px;">
                        <span>📦 Box #${s.num} <span style="color:#6c757d; font-size: 12px;">(${s.piano})</span></span>
                        <span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 4px;">${s.mq} Mq</span>
                    </div>
                    <div style="font-size: 12px; color: ${coloreTesto}; margin-top: 6px;">${prefissoNota}<em>${s.nota}</em></div>
                </li>`;
            });
            htmlLista += `</ul>`;
            divRisultati.innerHTML = htmlLista;
        } else {
            divRisultati.innerHTML = `<span style="color: red; font-weight: bold;">❌ Nessuna stanza libera trovata di esattamente ${filtroMq} Mq.</span>`;
        }
        divRisultati.style.display = 'block';
    }
};

window.selezionaDallaLista = function (numStanza, idMappa) {
    document.querySelectorAll('.stanza').forEach(el => {
        el.style.removeProperty('fill');
        el.style.removeProperty('stroke');
        el.style.removeProperty('stroke-width');
    });

    const stanza = document.querySelector(`.stanza[data-nome="${numStanza}"]`) || document.getElementById(`stanza-centro-${numStanza}`);
    if (stanza) {
        stanza.style.setProperty('fill', '#fffc33', 'important');
        stanza.style.setProperty('stroke', '#ff0000', 'important');
        stanza.style.setProperty('stroke-width', '4px', 'important');

        if (typeof window.mostraMappa === 'function' && idMappa) {
            window.mostraMappa(idMappa);
        }

        setTimeout(() => {
            const mapContainer = document.getElementById(idMappa);
            if (mapContainer) mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);

        window.mostraBottoneIndietro();
    }
};

window.mostraBottoneIndietro = function () {
    let btn = document.getElementById('btn-torna-ricerca');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'btn-torna-ricerca';
        btn.innerHTML = '⬅️ Torna ai risultati';
        btn.style.cssText = 'position: fixed; bottom: 30px; right: 30px; background-color: #343a40; color: white; border: none; padding: 15px 25px; border-radius: 50px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.4); z-index: 9999; transition: background-color 0.2s, transform 0.2s;';
        btn.onmouseover = () => { btn.style.backgroundColor = '#007bff'; btn.style.transform = 'scale(1.05)'; };
        btn.onmouseout = () => { btn.style.backgroundColor = '#343a40'; btn.style.transform = 'scale(1)'; };

        btn.onclick = () => {
            if (typeof window.chiudiMappe === 'function') window.chiudiMappe();
            const pannello = document.getElementById('pannello-ricerca-unificato');
            if (pannello) pannello.scrollIntoView({ behavior: 'smooth', block: 'start' });
            btn.style.display = 'none'; 
        };
        document.body.appendChild(btn);
    }
    btn.style.display = 'block';
};

// ==========================================
// 5. IMPORTAZIONE EXCEL (Grezzi, Email, Telefono)
// ==========================================
const CONFIG_BOTTONI = {
    grezzo: { btnId: 'btn-grezzo', inputId: 'file-grezzo', testoOriginale: '🤖 Carica Dati Grezzi', testoCompletato: '❌ Dati Grezzi Caricati' },
    email: { btnId: 'btn-email', inputId: 'fileEmail', testoOriginale: '📧 Carica File Email', testoCompletato: '❌ File Email Caricato' },
    cellulari: { btnId: 'btn-cellulari', inputId: 'fileCellulari', testoOriginale: '☎️ Carica File Cellulari', testoCompletato: '❌ File Cellulari Caricato', opacityOriginale: '0.75' },
    moveout: { btnId: 'btn-moveout', inputId: 'fileMoveOut', testoOriginale: '📦 Carica File MOVE OUT', testoCompletato: '❌ File Move Out Caricato' },
    paidahead: { btnId: 'btn-paidahead', inputId: 'filePaidAhead', testoOriginale: '💰 Carica Paid Ahead', testoCompletato: '❌ Paid Ahead Caricato' }
};

function getStatoCaricamenti() { return JSON.parse(localStorage.getItem(STATO_KEY)) || { grezzo: false, email: false, cellulari: false, moveout: false, paidahead: false }; }
function salvaStatoCaricamenti(stato) { localStorage.setItem(STATO_KEY, JSON.stringify(stato)); }

window.gestisciClickBottone = function (tipo) {
    const stato = getStatoCaricamenti();
    if (stato[tipo]) {
        if (confirm("Caricamento dati non completato, SBLOCCO?")) {
            stato[tipo] = false; salvaStatoCaricamenti(stato);
            window.aggiornaStatoGraficoBottone(tipo, false);
            document.getElementById(CONFIG_BOTTONI[tipo].inputId).value = '';
        }
        return;
    }
    document.getElementById(CONFIG_BOTTONI[tipo].inputId).click();
};

window.aggiornaStatoGraficoBottone = function (tipo, bloccato) {
    const conf = CONFIG_BOTTONI[tipo];
    const btn = document.getElementById(conf.btnId);
    if (!btn) return;
    if (bloccato) {
        btn.style.opacity = '0.5';
        btn.innerHTML = conf.testoCompletato;
        if (tipo === 'cellulari') btn.style.cursor = 'not-allowed';
    }
    else {
        btn.style.opacity = conf.opacityOriginale || '1';
        btn.innerHTML = conf.testoOriginale;
        btn.style.cursor = 'pointer';
    }
};

window.registraCompletamento = function (tipo) {
    const stato = getStatoCaricamenti();
    stato[tipo] = true;
    salvaStatoCaricamenti(stato);
    window.aggiornaStatoGraficoBottone(tipo, true);

    if (stato.grezzo && stato.email && stato.cellulari) {
        setTimeout(() => {
            alert("🎉 Tutti e 3 i file sono stati caricati con successo! I bottoni verranno sbloccati per un nuovo ciclo.");
            localStorage.removeItem(STATO_KEY);
            for (let t in CONFIG_BOTTONI) {
                window.aggiornaStatoGraficoBottone(t, false);
                const input = document.getElementById(CONFIG_BOTTONI[t].inputId);
                if (input) input.value = '';
            }
        }, 500);
    }
};

window.analizzaDataExcel = function (valore) {
    if (valore === undefined || valore === null || valore === "") return null;
    if (valore instanceof Date) return valore;
    if (typeof valore === 'number') return new Date(Math.round((valore - 25569) * 86400 * 1000));
    if (typeof valore === 'string') {
        const parti = valore.trim().split(/[\/\-\.]/);
        if (parti.length === 3) {
            const gg = parseInt(parti[0], 10);
            const mm = parseInt(parti[1], 10) - 1;
            let aaaa = parseInt(parti[2], 10);
            if (aaaa < 100) aaaa += 2000;
            return new Date(aaaa, mm, gg);
        }
        const dataTest = new Date(valore);
        if (!isNaN(dataTest.getTime())) return dataTest;
    }
    return null;
};

// ELABORAZIONE 1: DATI GREZZI 
window.elaboraDatiGrezzi = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const foglio = workbook.Sheets[workbook.SheetNames[0]];
            const righe = XLSX.utils.sheet_to_json(foglio, { header: 1 });
            
            window.memoriaFile33 = righe; 
            
            let dataQ1_pura = null;
            if (foglio['Q1']) dataQ1_pura = window.analizzaDataExcel(foglio['Q1'].v || foglio['Q1'].w);
            
            let stanzeAggiornate = 0;

            for (let i = 0; i < righe.length; i++) {
                const riga = righe[i];
                let unit = riga[0];
                if (!unit || ["unit", "lock check report", "milano centro"].includes(String(unit).trim().toLowerCase())) continue; 

                const idOStanza = String(unit).trim().toLowerCase();
                const customer = riga[3] ? String(riga[3]).trim() : ""; 
                const daysLate = riga[8]; 
                const duci = riga[10] ? String(riga[10]).trim().toLowerCase() : "";
                const comments = riga[12] ? String(riga[12]).trim() : ""; 

                let notaFinale = comments;
                let valoreColonnaI = Number(daysLate); 
                if (!isNaN(valoreColonnaI) && valoreColonnaI >= 1) {
                    const testoAggiuntivo = `Ritardo: ${valoreColonnaI} gg`; 
                    notaFinale = (notaFinale !== "") ? `${notaFinale} | ${testoAggiuntivo}` : testoAggiuntivo; 
                }

                const dataPartenzaGrezza = riga[5];
                const dataPartenzaPura = window.analizzaDataExcel(dataPartenzaGrezza); 
                const dataPartenzaTesto = dataPartenzaGrezza !== undefined && dataPartenzaGrezza !== null ? String(dataPartenzaGrezza) : "";

                let statoCalcolato = "libera"; 
                if (duci === "company") statoCalcolato = "company";
                else if (duci === "long term debtor") statoCalcolato = "debitore";
                else if (duci === "held") statoCalcolato = "held";
                else if (duci === "damaged") statoCalcolato = "damaged";
                else if (duci === "maintenance") statoCalcolato = "maintenance";
                else if (dataPartenzaPura !== null && dataQ1_pura !== null && dataPartenzaPura.getTime() > dataQ1_pura.getTime()) statoCalcolato = "movein"; 
                else if (daysLate !== undefined && daysLate !== null && String(daysLate).trim() !== "") {
                    let ggRitardo = Number(daysLate);
                    if (ggRitardo > 9) {
                        statoCalcolato = "debitore";
                    } else if (ggRitardo >= 1 && ggRitardo <= 9) {
                        statoCalcolato = "in-ritardo"; 
                    } else if (ggRitardo === 0) {
                        statoCalcolato = "occupata";   
                    }
                }

                let stanzaTrovata = null;
                document.querySelectorAll('.stanza').forEach(s => {
                    const idStanza = s.id.toLowerCase();
                    const nomeStanza = (s.getAttribute('data-nome') || "").toLowerCase();
                    if (idStanza === idOStanza || idStanza === `stanza-centro-${idOStanza}` || nomeStanza === idOStanza) {
                        stanzaTrovata = s;
                    }
                });

                if (stanzaTrovata) {
                    const eraDebitore = stanzaTrovata.classList.contains('debitore');
                    let ritardoAttualeExcel = 0;
                    if (daysLate !== undefined && daysLate !== null && String(daysLate).trim() !== "") {
                        ritardoAttualeExcel = Number(daysLate);
                    }

                    let datiDaAggiornare = { 
                        stato: statoCalcolato, 
                        notaCliente: notaFinale, 
                        cliente: customer, 
                        dataPartenza: dataPartenzaTesto,
                        isLongTerm: (duci === "long term debtor")

                    };

                    if (eraDebitore && ritardoAttualeExcel === 0 && statoCalcolato !== 'debitore') {
                        datiDaAggiornare.stato = 'debitore';       
                        datiDaAggiornare.richiestaSblocco = true;  
                        datiDaAggiornare.taskSblocca = null;       
                    }

                    const docRef = doc(db, "stanze", stanzaTrovata.id);
                    await setDoc(docRef, datiDaAggiornare, { merge: true });
                    stanzeAggiornate++;
                }
            } 
            
            event.target.value = ''; 
            alert(`Importazione completata: ${stanzeAggiornate} stanze aggiornate con successo!`);
            window.registraCompletamento('grezzo');
        } catch (error) { console.error(error); alert("Errore durante l'importazione."); }
    }; 
    reader.readAsArrayBuffer(file);
};

// ELABORAZIONE 2: EMAIL CLIENTI 
window.elaboraEmailClienti = async function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const foglio = workbook.Sheets[workbook.SheetNames[0]];
            const righe = XLSX.utils.sheet_to_json(foglio, { header: 1 });

            let datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
            let contatore = 0;

            for (let i = 0; i < righe.length; i++) {
                const riga = righe[i];
                if (riga[1] && riga[14]) {
                    const nomeCliente = String(riga[1]).trim().toLowerCase();
                    if (!datiPrivati[nomeCliente]) datiPrivati[nomeCliente] = {};
                    datiPrivati[nomeCliente].email = String(riga[14]).trim();
                    contatore++;
                }
            }

            localStorage.setItem('dati_privati_clienti', JSON.stringify(datiPrivati));
            event.target.value = '';
            alert(`Privacy: ${contatore} email salvate LOCALMENTE (Non condivise)!`);
            window.registraCompletamento('email');
        } catch (error) { console.error(error); alert("Errore importazione email."); }
    };
    reader.readAsArrayBuffer(file);
};

// ELABORAZIONE 3: CELLULARI CLIENTI
window.elaboraCellulariClienti = async function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const foglio = workbook.Sheets[workbook.SheetNames[0]];
            const righe = XLSX.utils.sheet_to_json(foglio, { header: 1 });

            let datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
            let contatore = 0;

            for (let i = 0; i < righe.length; i++) {
                const riga = righe[i];
                if (riga[0] && riga[21]) {
                    const nomeCliente = String(riga[0]).trim().toLowerCase();
                    let numeroTelefono = String(riga[21]).trim();
                    if (!numeroTelefono.startsWith("+") && !numeroTelefono.startsWith("00")) {
                        numeroTelefono = "+39 " + numeroTelefono;
                    }
                    if (!datiPrivati[nomeCliente]) datiPrivati[nomeCliente] = {};
                    datiPrivati[nomeCliente].telefono = numeroTelefono;
                    contatore++;
                }
            }

            localStorage.setItem('dati_privati_clienti', JSON.stringify(datiPrivati));
            event.target.value = '';
            alert(`Privacy: ${contatore} cellulari salvati LOCALMENTE (Non condivisi)!`);
            window.registraCompletamento('cellulari');
        } catch (error) { console.error(error); alert("Errore importazione cellulari."); }
    };
    reader.readAsArrayBuffer(file);
};

// ELABORAZIONE 5: PAID AHEAD
window.elaboraPaidAhead = async function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const foglio = workbook.Sheets[workbook.SheetNames[0]];
            const righe = XLSX.utils.sheet_to_json(foglio, { header: 1 });

            let datiPaidAhead = JSON.parse(localStorage.getItem('dati_paid_ahead')) || {};
            let contatore = 0;

            for (let i = 2; i < righe.length; i++) {
                const riga = righe[i];
                if (riga[1] && riga[2] && riga[8] !== undefined && riga[12] !== undefined) {
                    let stanzaGrezza = String(riga[1]).trim();
                    let numStanza = stanzaGrezza.split(':')[0].trim();
                    numStanza = parseInt(numStanza, 10).toString();

                    const nomeCliente = String(riga[2]).trim().toLowerCase();
                    const importo = parseFloat(riga[8]);
                    const giorniAhead = parseInt(riga[12], 10);

                    datiPaidAhead[numStanza] = {
                        cliente: nomeCliente,
                        importoDue: importo,
                        giorniPaidAhead: giorniAhead
                    };
                    contatore++;
                }
            }

            localStorage.setItem('dati_paid_ahead', JSON.stringify(datiPaidAhead));
            event.target.value = '';

            alert(`✅ Elaborazione completata in background!\n${contatore} dati finanziari (Paid Ahead) salvati in memoria, pronti per le email.`);
            window.registraCompletamento('paidahead');

        } catch (error) {
            console.error("Errore importazione Paid Ahead:", error);
            alert("Errore durante l'importazione del file Paid Ahead.");
        }
    };
    reader.readAsArrayBuffer(file);
};

// ELABORAZIONE 4: MOVE OUT 
window.elaboraMoveOut = async function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const foglio = workbook.Sheets[workbook.SheetNames[0]];
            const righe = XLSX.utils.sheet_to_json(foglio, { header: 1 });

            const mappaMoveOut = new Map();
            for (let i = 1; i < righe.length; i++) {
                const riga = righe[i];
                const stanzaExcel = riga[0] ? String(riga[0]).trim().toLowerCase() : "";
                const clienteExcel = riga[3] ? String(riga[3]).trim().toLowerCase() : "";
                const notaMoveOutExcel = riga[7];

                if (stanzaExcel && notaMoveOutExcel) {
                    mappaMoveOut.set(stanzaExcel, { cliente: clienteExcel, datoRaw: notaMoveOutExcel });
                }
            }

            const stanzeRef = collection(db, "stanze");
            const snapshot = await getDocs(stanzeRef);
            let stanzeAggiornate = 0;
            let erroriCliente = 0;
            const promesse = [];

            const pulisciNome = (nome) => nome.replace(/[^a-z0-9]/g, '');

            snapshot.forEach(docSnap => {
                const datiStanza = docSnap.data();
                const nomeStanzaFb = docSnap.id.replace('stanza-centro-', '').toLowerCase();

                if (mappaMoveOut.has(nomeStanzaFb)) {
                    const datiExcel = mappaMoveOut.get(nomeStanzaFb);
                    const clienteFb = datiStanza.cliente ? String(datiStanza.cliente).replace(/cliente:/i, '').trim().toLowerCase() : "";

                    const nomeFbPulito = pulisciNome(clienteFb);
                    const nomeExcelPulito = pulisciNome(datiExcel.cliente);

                    let clienteCorrisponde = false;
                    if (nomeFbPulito === "" || nomeExcelPulito === "" || nomeFbPulito.includes(nomeExcelPulito) || nomeExcelPulito.includes(nomeFbPulito)) {
                        clienteCorrisponde = true;
                    }

                    if (clienteCorrisponde) {
                        const dataPura = window.analizzaDataExcel(datiExcel.datoRaw);
                        let notaFormattata = String(datiExcel.datoRaw);

                        if (dataPura) {
                            notaFormattata = `${dataPura.getDate().toString().padStart(2, '0')}/${(dataPura.getMonth() + 1).toString().padStart(2, '0')}/${dataPura.getFullYear()}`;
                        }

                        let nuovaNota = datiStanza.notaCliente || "";
                        const stringaFinale = `📦 Move Out: ${notaFormattata}`;

                        if (!nuovaNota.includes(stringaFinale)) {
                            nuovaNota = (nuovaNota !== "") ? nuovaNota + " | " + stringaFinale : stringaFinale;

                            const docRef = doc(db, "stanze", docSnap.id);
                            promesse.push(setDoc(docRef, { notaCliente: nuovaNota }, { merge: true }));
                            stanzeAggiornate++;
                        }
                    } else {
                        console.warn(`Mismatch Cliente Stanza ${nomeStanzaFb}. DB: "${clienteFb}" / EXCEL: "${datiExcel.cliente}"`);
                        erroriCliente++;
                    }
                }
            });

            await Promise.all(promesse);
            event.target.value = '';

            let messaggio = `Elaborazione Move Out completata!\n✔️ ${stanzeAggiornate} stanze aggiornate.`;
            if (erroriCliente > 0) messaggio += `\n⚠️ ${erroriCliente} stanze ignorate per mismatch nome cliente.`;

            alert(messaggio);

            if (typeof window.registraCompletamento === 'function') window.registraCompletamento('moveout');

            localStorage.setItem('ultimo_moveout_completato', new Date().toDateString());
            if (typeof window.controllaAllarmeMoveOut === 'function') {
                window.controllaAllarmeMoveOut();
            }

            if (document.getElementById('container-todo').style.display === 'block') {
                window.aggiornaToDo();
            }

        } catch (error) {
            console.error("Errore importazione Move Out:", error);
            alert("Si è verificato un errore durante l'importazione.");
        }
    };
    reader.readAsArrayBuffer(file);
};

// ==========================================
// 6. GESTIONE UI E EVENTI INIZIALI
// ==========================================
window.mostraRegistrazione = function () {
    document.getElementById('box-login').style.display = 'none';
    document.getElementById('box-registrazione').style.display = 'block';
};

window.mostraModalPrivacy = function () {
    document.getElementById('modal-privacy').style.display = 'flex';
};

window.chiudiModalPrivacy = function () {
    document.getElementById('modal-privacy').style.display = 'none';
};

window.mostraLogin = function () {
    document.getElementById('box-registrazione').style.display = 'none';
    document.getElementById('box-login').style.display = 'block';
};

// ==========================================
// GESTIONE VISUALIZZAZIONE MAPPE E STAMPA
// ==========================================
window.mostraMappa = function (idMappa) {
    document.querySelectorAll('.container-mappa').forEach(map => {
        map.style.display = 'none';
        map.classList.remove('attiva');
    });
    const mappaSelezionata = document.getElementById(idMappa);
    if (mappaSelezionata) {
        mappaSelezionata.style.display = 'block';
        mappaSelezionata.classList.add('attiva');
    }
};

window.chiudiMappe = function () {
    document.querySelectorAll('.container-mappa').forEach(map => {
        map.style.display = 'none';
        map.classList.remove('attiva');
    });
};

window.stampaMappaCorrente = function () {
    const mappaAttiva = document.querySelector('.container-mappa.attiva');
    if (!mappaAttiva) { alert("Seleziona prima un piano da stampare."); return; }
    window.print();
};

window.stampaTutteMappe = function () {
    document.querySelectorAll('.container-mappa').forEach(map => {
        map.style.display = 'block';
    });
    window.print();
    setTimeout(() => { window.chiudiMappe(); }, 500);
};

// ==========================================
// RIPRISTINO APERTURA PANNELLI
// ==========================================
window.toggleBoxImporta = function () {
    const box = document.getElementById('box-importa');
    if (box) box.style.display = (box.style.display === 'none' || box.style.display === '') ? 'block' : 'none';
};

window.toggleBoxEsporta = function () {
    const box = document.getElementById('box-esporta');
    if (box) box.style.display = (box.style.display === 'none' || box.style.display === '') ? 'block' : 'none';
};

window.toggleBoxDebitori = function () {
    const box = document.getElementById('box-debitori');
    if (box) box.style.display = (box.style.display === 'none' || box.style.display === '') ? 'block' : 'none';
};

// ==========================================
// 12. GESTIONE DASHBOARD "TO DO" E MAIL
// ==========================================
window.toggleToDo = function () {
    const box = document.getElementById('container-todo');
    if (box.style.display === 'none' || box.style.display === '') {
        if (typeof window.aggiornaToDo === 'function') window.aggiornaToDo();
        box.style.display = 'block';
    } else {
        box.style.display = 'none';
    }
};

window.aggiornaToDo = async function () {
    const boxMoveOut = document.getElementById('todo-moveout-content');
    const boxBlocca = document.getElementById('todo-blocca-content');
    const boxSblocca = document.getElementById('todo-sblocca-content');
    if (!boxMoveOut || !boxBlocca || !boxSblocca) return;

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    let liste = { moveout: [], blocca: [], sblocca: [] };

    window.taskPendentiOggi = 0;
    window.taskGestitiOggi = 0;

    const mappePiani = {
        'map-centro-p-4': { nome: 'Piano -4', ordine: 1 }, 'map-centro-p-3': { nome: 'Piano -3', ordine: 2 },
        'map-centro-p-2': { nome: 'Piano -2', ordine: 3 }, 'map-centro-p-1': { nome: 'Piano -1', ordine: 4 },
        'map-centro-pt': { nome: 'Piano Terra', ordine: 5 }, 'map-centro-p1': { nome: 'Piano 1', ordine: 6 }
    };

    const creaTask = (numStanza, tipo, statoDbTask, isPassato = false) => {
        const stanzaEl = document.querySelector(`.stanza[data-nome="${numStanza}"]`) || document.getElementById(`stanza-centro-${numStanza}`);
        let infoPiano = { nome: "Sconosciuto", ordine: 99 };
        if (stanzaEl) {
            const contenitore = stanzaEl.closest('.container-mappa');
            if (contenitore) infoPiano = mappePiani[contenitore.id] || infoPiano;
        }
        return { stanza: numStanza, piano: infoPiano.nome, ordinePiano: infoPiano.ordine, tipo: tipo, statoAttuale: statoDbTask, isPassato: isPassato };
    };

    try {
        const stanzeRef = collection(db, "stanze");
        const snapshot = await getDocs(stanzeRef);

        snapshot.forEach(docSnap => {
            const numStanza = docSnap.id.replace('stanza-centro-', '');
            const dati = docSnap.data();
            const nota = dati.notaCliente || "";
            const statoStanza = dati.stato || "";

            const statoTaskMoveout = dati.taskMoveout || null;
            const statoTaskBlocca = dati.taskBlocca || null;
            const statoTaskSblocca = dati.taskSblocca || null;

            // --- LOGICA MOVE OUT ---
            const matchMove = nota.match(/📦 Move Out: (\d{2})\/(\d{2})\/(\d{4})/);
            if (matchMove) {
                const dataNota = new Date(parseInt(matchMove[3], 10), parseInt(matchMove[2], 10) - 1, parseInt(matchMove[1], 10));
                dataNota.setHours(0, 0, 0, 0);
                const taskPassato = dataNota.getTime() < oggi.getTime();

                if (dataNota.getTime() <= oggi.getTime()) {
                    const taskObj = creaTask(numStanza, 'moveout', statoTaskMoveout, taskPassato);
                    if (taskObj.statoAttuale === 'V' || taskObj.statoAttuale === 'X') window.taskGestitiOggi++;
                    else window.taskPendentiOggi++;

                    if (taskObj.statoAttuale !== 'V') {
                        if (!taskPassato || (taskPassato && taskObj.statoAttuale === 'X')) {
                            liste.moveout.push(taskObj);
                        }
                    }
                }
            }

            // --- LOGICA BLOCCA ---
            const matchRitardo = nota.match(/Ritardo:\s*(\d+)\s*gg/i);
            let giorniRitardo = 0;
            if (matchRitardo) {
                giorniRitardo = parseInt(matchRitardo[1], 10);
            }

            if (giorniRitardo >= 10) {
                const taskObj = creaTask(numStanza, 'blocca', statoTaskBlocca);
                taskObj.giorniRitardo = giorniRitardo;

                if (taskObj.statoAttuale === 'V' || taskObj.statoAttuale === 'X') window.taskGestitiOggi++;
                else window.taskPendentiOggi++;

                if (taskObj.statoAttuale !== 'V') liste.blocca.push(taskObj);
            }

            // --- LOGICA SBLOCCA ---
            if (dati.richiestaSblocco === true || (statoStanza === 'debitore' && !nota.includes('Ritardo:'))) {
                const taskObj = creaTask(numStanza, 'sblocca', statoTaskSblocca);

                if (taskObj.statoAttuale === 'V' || taskObj.statoAttuale === 'X') window.taskGestitiOggi++;
                else window.taskPendentiOggi++;

                if (taskObj.statoAttuale !== 'V') liste.sblocca.push(taskObj);
            }
        });
    } catch (e) { console.error("Errore lettura TO DO dal DB:", e); }

    const ordina = (a, b) => a.ordinePiano - b.ordinePiano || a.stanza.localeCompare(b.stanza);
    const generaRiga = (item) => {
        const isAzzurro = (item.isPassato && item.statoAttuale === 'X');
        const bgColor = isAzzurro ? '#e0f7fa' : '#f8f9fa';
        const borderColor = isAzzurro ? '#17a2b8' : '#fd7e14';
        const testoRitardo = isAzzurro ? `<br><span style="font-size: 11px; color: #dc3545; font-weight:bold;">(Ricontrolla X)</span>` : '';

        const coloreV = item.statoAttuale === 'V' ? '#28a745' : '#e9ecef';
        const testoV = item.statoAttuale === 'V' ? 'white' : '#6c757d';
        const coloreX = item.statoAttuale === 'X' ? '#dc3545' : '#e9ecef';
        const testoX = item.statoAttuale === 'X' ? 'white' : '#6c757d';

        let tastoCalendario = "";
        if (item.tipo === 'moveout') {
            tastoCalendario = `<button onclick="cambiaDataMoveOut('${item.stanza}')" style="background-color: #17a2b8; color: white; border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-weight: bold; transition: 0.2s; margin-right: 2px;" title="Posticipa Data">📅</button>`;
        }

        let badgeGiorni = "";
        if (item.giorniRitardo) {
            badgeGiorni = `<span style="background: #dc3545; color: white; border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: bold; margin-left: 5px;" title="Giorni di ritardo">${item.giorniRitardo} gg</span>`;
        }

        return `
        <div class="todo-item-riga" data-id="${item.stanza}" data-tipo="${item.tipo}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px; margin-bottom: 8px; border-radius: 6px; background-color: ${bgColor}; border-left: 4px solid ${borderColor};">
            <div style="font-size: 15px;">
                <strong>#${item.stanza}</strong> <span style="font-size: 13px; color: #555;">(${item.piano})</span> ${badgeGiorni} ${testoRitardo}
            </div>
            <div style="display: flex; gap: 8px;">
                ${tastoCalendario}
                <button onclick="salvaStatoToDo('${item.stanza}', '${item.tipo}', 'V')" style="background-color: ${coloreV}; color: ${testoV}; border: 1px solid #ccc; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-weight: bold; transition: 0.2s;">✅ V</button>
                <button onclick="salvaStatoToDo('${item.stanza}', '${item.tipo}', 'X')" style="background-color: ${coloreX}; color: ${testoX}; border: 1px solid #ccc; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-weight: bold; transition: 0.2s;">❌ X</button>
            </div>
        </div>`;
    };

    const renderBox = (tipo, boxElement) => {
        liste[tipo].sort(ordina);
        let html = "";
        liste[tipo].forEach(item => { html += generaRiga(item); });
        html += `<button onclick="inserisciTaskManuale('${tipo}')" style="margin-top: 10px; width: 100%; background: #f8f9fa; border: 1px dashed #ccc; padding: 5px; cursor: pointer; color: #666; border-radius: 4px;">➕ Aggiungi Box Manuale</button>`;

        if (liste[tipo].length === 0) html = `<p style="text-align: center; font-style: italic; color: #999;">Nessuna attività</p>` + html;
        boxElement.innerHTML = html;
    };

    renderBox('moveout', boxMoveOut);
    renderBox('blocca', boxBlocca);
    renderBox('sblocca', boxSblocca);

    setTimeout(window.controllaCompletamentoToDo, 1000);
};

window.cambiaDataMoveOut = async function (numStanza) {
    const nuovaData = prompt("Inserisci la nuova data per il Move Out nel formato GG/MM/AAAA\n(es. 15/09/2026):");
    if (!nuovaData || nuovaData.trim() === "") return;

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(nuovaData)) {
        alert("❌ Formato data non valido! Devi usare il formato GG/MM/AAAA (es. 05/10/2026).");
        return;
    }

    try {
        const docRef = doc(db, "stanze", `stanza-centro-${numStanza}`);
        const docSnap = await getDocs(collection(db, "stanze"));
        let notaAttuale = "";
        docSnap.forEach(d => { if (d.id === `stanza-centro-${numStanza}`) notaAttuale = d.data().notaCliente || ""; });

        let nuovaNota = notaAttuale;
        if (nuovaNota.match(/📦 Move Out: \d{2}\/\d{2}\/\d{4}/)) {
            nuovaNota = nuovaNota.replace(/📦 Move Out: \d{2}\/\d{2}\/\d{4}/, `📦 Move Out: ${nuovaData}`);
        } else {
            nuovaNota = nuovaNota ? `${nuovaNota} | 📦 Move Out: ${nuovaData}` : `📦 Move Out: ${nuovaData}`;
        }

        await setDoc(docRef, { notaCliente: nuovaNota, taskMoveout: null }, { merge: true });
        alert(`✅ Data aggiornata con successo! Il box riapparirà nella lista TO DO il ${nuovaData}.`);
        window.aggiornaToDo();

    } catch (error) { console.error(error); alert("Errore durante il cambio data."); }
};

window.inserisciTaskManuale = async function (tipo) {
    const numStanza = prompt(`Inserisci il numero del box da aggiungere a ${tipo.toUpperCase()}:`);
    if (!numStanza || numStanza.trim() === "") return;

    try {
        const docRef = doc(db, "stanze", `stanza-centro-${numStanza}`);
        if (tipo === 'sblocca') {
            await setDoc(docRef, { richiestaSblocco: true, stato: 'debitore', taskSblocca: null }, { merge: true });
        } else if (tipo === 'blocca') {
            await setDoc(docRef, { notaCliente: "Ritardo: 10 gg", taskBlocca: null }, { merge: true });
        } else if (tipo === 'moveout') {
            const oggi = new Date();
            const strData = `${oggi.getDate().toString().padStart(2, '0')}/${(oggi.getMonth() + 1).toString().padStart(2, '0')}/${oggi.getFullYear()}`;
            await setDoc(docRef, { notaCliente: `📦 Move Out: ${strData}`, taskMoveout: null }, { merge: true });
        }
        window.aggiornaToDo();
    } catch (e) { console.error("Errore inserimento manuale:", e); alert("Errore nell'inserimento manuale."); }
};

window.salvaStatoToDo = async function (numStanza, tipoTask, clickStato) {
    try {
        const docRef = doc(db, "stanze", `stanza-centro-${numStanza}`);
        let campoTask = "";
        if (tipoTask === 'sblocca') campoTask = "taskSblocca";
        else if (tipoTask === 'blocca') campoTask = "taskBlocca";
        else if (tipoTask === 'moveout') campoTask = "taskMoveout";

        const docSnap = await getDocs(collection(db, "stanze"));
        let statoCorrenteDb = null;
        docSnap.forEach(d => { if (d.id === `stanza-centro-${numStanza}`) statoCorrenteDb = d.data()[campoTask]; });

        const statoFinale = (statoCorrenteDb === clickStato) ? null : clickStato;
        let updateData = {};
        updateData[campoTask] = statoFinale;

        window.azioneEseguitaOggi = true;
        const dataOggiId = new Date().toDateString();
        if (statoFinale) {
            localStorage.setItem(`mailLog_${numStanza}_${tipoTask}_${dataOggiId}`, statoFinale);
        } else {
            localStorage.removeItem(`mailLog_${numStanza}_${tipoTask}_${dataOggiId}`);
        }

        if (statoFinale === 'V') {
            if (tipoTask === 'sblocca') {
                updateData.stato = 'occupata';
                updateData.richiestaSblocco = false;
            }
            else if (tipoTask === 'blocca') updateData.stato = 'debitore';
            else if (tipoTask === 'moveout') updateData.stato = 'libera';
        }

        await setDoc(docRef, updateData, { merge: true });
        window.aggiornaToDo();
    } catch (error) { console.error("Errore durante il salvataggio del TO DO:", error); }
};

window.controllaCompletamentoToDo = function () {
    const dataOggiStr = new Date().toDateString();

    if (window.taskPendentiOggi === 0 && window.azioneEseguitaOggi && localStorage.getItem('todo_email_inviata') !== dataOggiStr) {

        let reportMoveOut = "";
        let reportBlocca = "";
        let reportSblocca = "";
        let taskSalvatiOggi = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('mailLog_') && key.endsWith(dataOggiStr)) {
                const parti = key.split('_');
                const numStanza = parti[1];
                const tipoTask = parti[2];
                const stato = localStorage.getItem(key);

                if (tipoTask === 'moveout') {
                    if (stato === 'V') reportMoveOut += `✅ Box #${numStanza}: CHIUDI CONTRATTO\n`;
                    else if (stato === 'X') reportMoveOut += `❌ Box #${numStanza}: CHIAMA IL CLIENTE PER NUOVA DATA\n`;
                    taskSalvatiOggi++;
                }
                else if (tipoTask === 'blocca') {
                    if (stato === 'V') reportBlocca += `✅ Box #${numStanza}: BLOCCATO\n`;
                    else if (stato === 'X') reportBlocca += `❌ Box #${numStanza}: DA VERIFICARE\n`;
                    taskSalvatiOggi++;
                }
                else if (tipoTask === 'sblocca') {
                    if (stato === 'V') reportSblocca += `✅ Box #${numStanza}: SBLOCCATO\n`;
                    else if (stato === 'X') reportSblocca += `❌ Box #${numStanza}: NON SBLOCCATO\n`;
                    taskSalvatiOggi++;
                }
            }
        }

        if (taskSalvatiOggi === 0) return;

        let bloccoRiepilogo = "\n\n=== RIEPILOGO ATTIVITÀ DI OGGI ===\n";
        if (reportMoveOut) bloccoRiepilogo += `\n📦 MOVE OUT:\n${reportMoveOut}`;
        if (reportBlocca) bloccoRiepilogo += `\n🔒 BLOCCA:\n${reportBlocca}`;
        if (reportSblocca) bloccoRiepilogo += `\n🔓 SBLOCCA:\n${reportSblocca}`;
        bloccoRiepilogo += `\n==================================\n`;

        const email = "milanocentro@easybox.it";
        const subject = encodeURIComponent("✅ ATTIVITÀ TO DO COMPLETATE");
        const messaggioBase = `Ciao,\n\nTi informiamo che tutte le attività operative nei 3 pannelli TO DO (Move Out, Blocca, Sblocca) previste per oggi sono state completate e verificate.${bloccoRiepilogo}\nBuon lavoro,\nIl Gestionale Easybox`;
        const body = encodeURIComponent(messaggioBase);

        localStorage.setItem('todo_email_inviata', dataOggiStr);

        const overlay = document.createElement('div');
        overlay.id = 'modal-scelta-mail';
        overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;`;

        const modal = document.createElement('div');
        modal.style.cssText = `background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); width: 90%; max-width: 400px; text-align: center; font-family: Arial, sans-serif;`;

        modal.innerHTML = `
            <h3 style="color: #28a745; margin-top: 0; font-size: 22px;">🎉 Ottimo lavoro!</h3>
            <p style="color: #555; font-size: 14px; margin-bottom: 20px;">Tutte le attività TO DO sono state verificate.<br>Come preferisci inviare il report ora?</p>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button id="btn-mail-desktop" style="background-color: #007bff; color: white; border: none; padding: 12px; font-size: 15px; font-weight: bold; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s;">🖥️ Usa App Desktop (Es. Outlook)</button>
                <button id="btn-mail-web" style="background-color: #dc3545; color: white; border: none; padding: 12px; font-size: 15px; font-weight: bold; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s;">🌐 Usa Gmail dal Browser</button>
                <button id="btn-mail-annulla" style="background-color: #6c757d; color: white; border: none; padding: 10px; font-size: 14px; border-radius: 6px; cursor: pointer; margin-top: 10px;">Chiudi senza inviare</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('btn-mail-desktop').onclick = () => {
            document.body.removeChild(overlay);
            window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        };

        document.getElementById('btn-mail-web').onclick = () => {
            document.body.removeChild(overlay);
            const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}&body=${body}`;
            window.open(gmailLink, '_blank');
        };

        document.getElementById('btn-mail-annulla').onclick = () => {
            document.body.removeChild(overlay);
        };
    }
};

const GIORNO_ALLARME_MOVE_OUT = 1; 

window.controllaAllarmeMoveOut = function () {
    const btnMoveOut = document.getElementById('btn-moveout');
    if (!btnMoveOut) return;

    const oggi = new Date();
    const giornoSettimana = oggi.getDay();
    const dataOggiStringa = oggi.toDateString();

    const ultimoCompletamento = localStorage.getItem('ultimo_moveout_completato');

    if (giornoSettimana === GIORNO_ALLARME_MOVE_OUT && ultimoCompletamento !== dataOggiStringa) {
        btnMoveOut.classList.add('allarme-moveout');
        btnMoveOut.innerHTML = '🔔 URGENTE: Carica MOVE OUT!';
    } else {
        btnMoveOut.classList.remove('allarme-moveout');
        const stato = getStatoCaricamenti();
        if (!stato['moveout']) {
            btnMoveOut.innerHTML = '📦 Carica File MOVE OUT';
        }
    }
};

// ==========================================
// STAMPA FILE 33 (LOCK CHECK REPORT) 
// ==========================================
window.stampaFile33 = async function() {
    if (!window.memoriaFile33 || window.memoriaFile33.length === 0) {
        alert("Nessun dato grezzo caricato. Carica prima il file Excel dei Dati Grezzi.");
        return;
    }

    try {
        const btnFile33 = document.querySelector('button[onclick="stampaFile33()"]');
        const testoOriginaleBtn = btnFile33.innerHTML;
        btnFile33.innerHTML = "⏳ Generazione in corso...";
        btnFile33.disabled = true;

        const stanzeRef = collection(db, "stanze");
        const snapshot = await getDocs(stanzeRef);
        const noteDb = {};
        
        snapshot.forEach(docSnap => {
            const numStanza = docSnap.id.replace('stanza-centro-', '');
            noteDb[numStanza] = docSnap.data().notaCliente || "";
        });

        const righeOriginali = window.memoriaFile33;
        const intestazioniOriginali = righeOriginali[1] || []; 
        const intestazioniDaEsportare = intestazioniOriginali.slice(0, 17);
        
        intestazioniDaEsportare.push("Lock check odit (V o X)");
        intestazioniDaEsportare.push("Note Cliente Attuale");

        const dataDaEsportare = [];
        dataDaEsportare.push(intestazioniDaEsportare); 

        for (let i = 2; i < righeOriginali.length; i++) {
            const riga = righeOriginali[i];
            const unit = riga[0];
            if (!unit || String(unit).trim() === "") continue;

            const numStanza = String(unit).trim().toLowerCase();
            const nuovaRiga = [];
            for (let j = 0; j < 17; j++) {
                nuovaRiga.push(riga[j] !== undefined ? riga[j] : "");
            }

            nuovaRiga.push("V"); 
            const notaDalDb = noteDb[numStanza] || "";
            nuovaRiga.push(notaDalDb);

            dataDaEsportare.push(nuovaRiga);
        }

        const worksheet = XLSX.utils.aoa_to_sheet(dataDaEsportare);
        const workbook = XLSX.utils.book_new();
        
        const wscols = [];
        for (let i = 0; i < intestazioniDaEsportare.length; i++) {
             wscols.push({ wch: 15 }); 
        }
        wscols[intestazioniDaEsportare.length - 2] = { wch: 22 }; 
        wscols[intestazioniDaEsportare.length - 1] = { wch: 40 }; 
        worksheet['!cols'] = wscols;

        XLSX.utils.book_append_sheet(workbook, worksheet, "Lock Check Completo");

        const oggi = new Date();
        const dataString = `${oggi.getDate().toString().padStart(2, '0')}-${(oggi.getMonth() + 1).toString().padStart(2, '0')}-${oggi.getFullYear()}`;
        XLSX.writeFile(workbook, `Lock_Check_Completo_${dataString}.xlsx`);

        btnFile33.innerHTML = testoOriginaleBtn;
        btnFile33.disabled = false;
        alert("Report Lock Check Completo generato e scaricato con successo!");

    } catch (error) {
        console.error("Errore durante la generazione del report:", error);
        alert("Si è verificato un errore durante la generazione del report. Controlla la console.");
        const btnFile33 = document.querySelector('button[onclick="stampaFile33()"]');
        if (btnFile33) {
            btnFile33.innerHTML = "🖨️ Stampa File 33";
            btnFile33.disabled = false;
        }
    }
};

// ==========================================
// 8. ESPORTAZIONE EXCEL E REPORT PULIZIE
// ==========================================
window.esportaExcel = function () {
    const data = [];
    const statiValidi = ['occupata', 'debitore', 'company', 'damaged', 'maintenance', 'movein', 'held'];
    const mappePiani = {
        'map-centro-pt': 'Piano Terra', 'map-centro-p-1': 'Piano -1',
        'map-centro-p1': 'Piano 1', 'map-centro-p-2': 'Piano -2',
        'map-centro-p-3': 'Piano -3', 'map-centro-p-4': 'Piano -4'
    };

    document.querySelectorAll('.container-mappa').forEach(mappa => {
        const idMappa = mappa.id;
        const nomePiano = mappePiani[idMappa] || idMappa;

        mappa.querySelectorAll('.stanza').forEach(stanza => {
            const numeroStanza = stanza.getAttribute('data-nome') || stanza.id;
            const cliente = stanza.getAttribute('data-cliente') || "";
            const dataPartenza = stanza.getAttribute('data-partenza') || "";
            const notaCliente = stanza.getAttribute('data-nota-cliente') || "";

            let emailCliente = ""; let telefonoCliente = "";

            if (cliente) {
                const nomeClean = cliente.replace(/cliente:/i, '').trim().toLowerCase();
                const datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
                if (datiPrivati[nomeClean]) {
                    emailCliente = datiPrivati[nomeClean].email || "";
                    telefonoCliente = datiPrivati[nomeClean].telefono || "";
                }
            }

            let statoStanza = "Libera";
            const classi = Array.from(stanza.classList);
            const statoTrovato = classi.find(c => statiValidi.includes(c));
            if (statoTrovato) statoStanza = statoTrovato.charAt(0).toUpperCase() + statoTrovato.slice(1);

            data.push({ 'Piano': nomePiano, 'Numero Stanza': numeroStanza, 'Stato': statoStanza, 'Cliente': cliente, 'Data Partenza': dataPartenza, 'Email': emailCliente, 'Cellulare': telefonoCliente });
        });
    });

    if (data.length === 0) { alert("Nessuna stanza trovata da esportare."); return; }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    worksheet['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 35 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stato Stanze");

    const oggi = new Date();
    const dataString = `${oggi.getDate().toString().padStart(2, '0')}-${(oggi.getMonth() + 1).toString().padStart(2, '0')}-${oggi.getFullYear()}`;
    XLSX.writeFile(workbook, `Report_Centro_${dataString}.xlsx`);
};

function recuperaDatiPulizie() {
    const data = [];
    const mappePiani = { 'map-centro-pt': 'Piano Terra', 'map-centro-p-1': 'Piano -1', 'map-centro-p1': 'Piano 1', 'map-centro-p-2': 'Piano -2', 'map-centro-p-3': 'Piano -3', 'map-centro-p-4': 'Piano -4' };

    document.querySelectorAll('.container-mappa').forEach(mappa => {
        const idMappa = mappa.id;
        const nomePiano = mappePiani[idMappa] || idMappa;
        mappa.querySelectorAll('.stanza').forEach(stanza => {
            const numeroStanza = stanza.getAttribute('data-nome') || stanza.id;
            const idSimboloPulizia = `pulizia-${stanza.id}`;
            const necessitaPulizia = document.getElementById(idSimboloPulizia) !== null || stanza.getAttribute('data-dapulire') === 'true';
            if (necessitaPulizia) data.push({ 'Piano': nomePiano, 'Numero Stanza': numeroStanza, 'Pulita ( SI / NO )': '' });
        });
    });
    return data;
}

window.gestisciReportPulizie = function () {
    const dati = recuperaDatiPulizie();
    if (dati.length === 0) { alert("Ottime notizie! Nessuna stanza risulta da pulire in questo momento."); return; }

    const overlay = document.createElement('div');
    overlay.id = 'modal-pulizie-overlay';
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; font-family: sans-serif;`;

    const modal = document.createElement('div');
    modal.style.cssText = `background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); text-align: center; max-width: 360px; width: 90%;`;
    modal.innerHTML = `<h3 style="margin-top: 0; color: #333;">🧹 Report Pulizie</h3><p style="color: #666; margin-bottom: 20px;">Trovate <strong>${dati.length}</strong> stanze da pulire.</p><div style="display: flex; flex-direction: column; gap: 10px;"><button id="btn-scelta-excel" style="background-color: #28a745; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">📊 Esporta in Excel</button><button id="btn-scelta-stampa" style="background-color: #007bff; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: bold;">🖨️ Stampa Report</button><button id="btn-scelta-annulla" style="background-color: #6c757d; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer;">Annulla</button></div>`;
    overlay.appendChild(modal); document.body.appendChild(overlay);

    const chiudiModal = () => document.body.removeChild(overlay);
    document.getElementById('btn-scelta-excel').onclick = () => { chiudiModal(); window.esportaReportPulizie(dati); };
    document.getElementById('btn-scelta-stampa').onclick = () => { chiudiModal(); window.stampaReportPulizie(dati); };
    document.getElementById('btn-scelta-annulla').onclick = chiudiModal;
};

window.esportaReportPulizie = function (dati) {
    const data = dati || recuperaDatiPulizie();
    if (data.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    worksheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report Pulizie");
    const oggi = new Date();
    const dataString = `${oggi.getDate().toString().padStart(2, '0')}-${(oggi.getMonth() + 1).toString().padStart(2, '0')}-${oggi.getFullYear()}`;
    XLSX.writeFile(workbook, `Report_Da_Pulire_Centro_${dataString}.xlsx`);
};

window.stampaReportPulizie = function (dati) {
    const data = dati || recuperaDatiPulizie();
    if (data.length === 0) return;
    const oggi = new Date();
    const dataString = `${oggi.getDate().toString().padStart(2, '0')}/${(oggi.getMonth() + 1).toString().padStart(2, '0')}/${oggi.getFullYear()}`;
    
    if (window.AndroidApp) {
        const div = document.createElement('div');
        div.id = 'stampa-mobile-overlay';
        div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:999999;overflow-y:auto;padding:20px;';
        
        let righeHtml = data.map(item => `<tr><td style="border: 1px solid #ccc; padding: 10px;">${item['Piano']}</td><td style="border: 1px solid #ccc; padding: 10px; font-weight: bold;">${item['Numero Stanza']}</td><td style="border: 1px solid #ccc; padding: 10px; text-align: center;">[ &nbsp; ] SI &nbsp; [ &nbsp; ] NO</td></tr>`).join('');
        
        div.innerHTML = `
            <div style="display:flex;gap:10px;margin-bottom:20px;">
                <button onclick="document.body.removeChild(this.parentElement.parentElement)" style="flex:1;background:#dc3545;color:white;padding:15px;border:none;border-radius:8px;font-weight:bold;font-size:14px;box-shadow: 0 4px 6px rgba(0,0,0,0.2);">⬅️ INDIETRO</button>
                <button onclick="window.print()" style="flex:1;background:#007bff;color:white;padding:15px;border:none;border-radius:8px;font-weight:bold;font-size:14px;box-shadow: 0 4px 6px rgba(0,0,0,0.2);">🖨️ STAMPA</button>
            </div>
            <h2 style="color:black;margin-top:0;">🧹 Report Stanze da Pulire</h2><p style="color:black;">Data: <strong>${dataString}</strong> | Stanze: <strong>${data.length}</strong></p>
            <table style="width:100%;border-collapse:collapse;color:black;font-size:14px;"><thead><tr><th style="background:#f2f2f2;border:1px solid #ccc;padding:10px;text-align:left;">Piano</th><th style="background:#f2f2f2;border:1px solid #ccc;padding:10px;text-align:left;">Stanza</th><th style="background:#f2f2f2;border:1px solid #ccc;padding:10px;text-align:left;">Esito Pulizia</th></tr></thead><tbody>${righeHtml}</tbody></table>
        `;
        document.body.appendChild(div);
    } 
    else {
        const printWindow = window.open('', '_blank');
        let righeHtml = data.map(item => `<tr><td style="border: 1px solid #ccc; padding: 10px;">${item['Piano']}</td><td style="border: 1px solid #ccc; padding: 10px; font-weight: bold;">${item['Numero Stanza']}</td><td style="border: 1px solid #ccc; padding: 10px; text-align: center;">[ &nbsp; ] SI &nbsp; [ &nbsp; ] NO</td></tr>`).join('');
        printWindow.document.write(`<title>Report Pulizie - ${dataString}</title><style>body { font-family: Arial, sans-serif; padding: 20px; color: #333; } table { width: 100%; border-collapse: collapse; margin-top: 10px; } th { background-color: #f2f2f2; border: 1px solid #ccc; padding: 10px; text-align: left; } @media print { button { display: none; } }</style><h1>🧹 Report Stanze da Pulire</h1><p>Data: <strong>${dataString}</strong> | Stanze totali: <strong>${data.length}</strong></p><table><thead><tr><th>Piano</th><th>Numero Stanza</th><th>Esito Pulizia</th></tr></thead><tbody>${righeHtml}</tbody></table>`);
        printWindow.document.close(); printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
    }
};

window.gestisciLucchetto = function(numStanza, mostra) {
    const idStanza = 'stanza-centro-' + numStanza;
    const stanzaEl = document.getElementById(idStanza);
    const idLucchetto = 'lucchetto-' + numStanza;
    
    const vecchio = document.getElementById(idLucchetto);
    if (vecchio) vecchio.remove();

    if (mostra && stanzaEl) {
        const x = parseFloat(stanzaEl.getAttribute('x') || 0);
        const y = parseFloat(stanzaEl.getAttribute('y') || 0);
        const w = parseFloat(stanzaEl.getAttribute('width') || 0);
        const h = parseFloat(stanzaEl.getAttribute('height') || 0);

        const cx = x + (w / 2);
        const cy = y + (h / 2);
        
        let size = Math.min(w, h) * 0.5; 
        if (size < 10) size = 10; 
        
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("id", idLucchetto);
        g.style.pointerEvents = "none"; 
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M12 2C9.24 2 7 4.24 7 7V9H6C4.9 9 4 9.9 4 11V21C4 22.1 4.9 23 6 23H18C19.1 23 20 22.1 20 21V11C20 9.9 19.1 9 18 9H17V7C17 4.24 14.76 2 12 2ZM12 4C13.66 4 15 5.34 15 7V9H9V7C9 5.34 10.34 4 12 4ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17Z");
        
        path.setAttribute("fill", "#ffffff"); 
        path.style.filter = "drop-shadow(2px 2px 3px rgba(0,0,0,0.8))"; 
        
        const scale = size / 24; 
        path.setAttribute("transform", `translate(${cx}, ${cy}) scale(${scale}) translate(-12, -12)`);
        
        g.appendChild(path);
        stanzaEl.parentNode.appendChild(g); 
    }
};

// ==========================================
// 💬 GENERAZIONE FILE WHATSAPP 
// ==========================================
window.generaFilePerMacro = async function () {
    try {
        const stanzeRef = collection(db, "stanze");
        const snapshot = await getDocs(stanzeRef);

        const datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
        const datiPaidAhead = JSON.parse(localStorage.getItem('dati_paid_ahead')) || {};

        let htmlLista = "";
        let contenutoFile = "";
        let contatore = 0;

        const ora = new Date().getHours(); 
        let saluto = "Buongiorno";
        if (ora >= 12 && ora < 18) saluto = "Buon pomeriggio"; 
        else if (ora >= 18 || ora < 5) saluto = "Buonasera";

        for (let numStanza in datiPaidAhead) {
            const infoFin = datiPaidAhead[numStanza];
            const gg = infoFin.giorniPaidAhead;

            if (gg === 3 || gg === 0) {
                let nomeCliente = infoFin.cliente;
                const nomeClean = nomeCliente.toLowerCase();
                let telefono = "";
                
                if (datiPrivati[nomeClean] && datiPrivati[nomeClean].telefono) {
                    telefono = datiPrivati[nomeClean].telefono.replace(/[\s-]/g, '');
                }

                if (telefono) {
                    const nomeFormattato = nomeCliente.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    let scadenzaStr = (gg === 3) ? "tra 3 giorni" : "nella giornata di oggi";
                    
                    let messaggio = `${saluto} ${nomeFormattato},\nti informiamo da Easybox che il canone del tuo box scadrà ${scadenzaStr}.\n\nSe hai già impostato il pagamento automatico (RID), ti preghiamo di ignorare questo messaggio. Se invece desideri comunicarci il tuo IBAN per agganciare il metodo diretto, contattaci allo 0281127477.\n\nUn cordiale saluto,\nIl Team Easybox`;

                    let messaggioCodificato = encodeURIComponent(messaggio);
                    contenutoFile += `${telefono}|${messaggioCodificato}\r\n`;

                    let telWa = telefono;
                    if (telWa.startsWith('00')) telWa = '+' + telWa.substring(2);
                    if (!telWa.startsWith('+')) telWa = '+39' + telWa;
                    telWa = telWa.replace('+', '');

                    const linkWa = `https://wa.me/${telWa}?text=${messaggioCodificato}`;
                    const nomeSicuro = nomeClean.replace(/'/g, "\\'");
                    const etichettaGiorni = (gg === 3) ? "Scade tra 3 gg" : "Scade OGGI";

                    htmlLista += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; background: #e0f7fa; border-radius: 6px; margin-bottom: 8px; border-left: 4px solid #17a2b8;">
                            <div style="text-align: left;">
                                <strong style="color: #333;">Box #${numStanza} - ${nomeFormattato}</strong><br>
                                <span style="font-size: 12px; color: #17a2b8; font-weight: bold;">Avviso: ${etichettaGiorni}</span> <span style="font-size: 12px; color: #666;">(${telefono})</span>
                            </div>
                            <a href="${linkWa}" target="_blank" onclick="cancellaSingoloTelefono('${nomeSicuro}', this)" style="background-color: #25D366; color: white; padding: 8px 15px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: 0.2s;">Invia 💬</a>
                        </div>
                    `;
                    contatore++;
                }
            }
        }

        snapshot.forEach(docSnap => {
            const dati = docSnap.data();

            if (dati.stato === "debitore") {
                const numStanza = docSnap.id.replace('stanza-centro-', '');
                let nomeCliente = dati.cliente ? String(dati.cliente).replace("Cliente:", "").trim() : "Cliente";

                const nomeClean = nomeCliente.toLowerCase();
                let telefono = "";
                if (datiPrivati[nomeClean] && datiPrivati[nomeClean].telefono) {
                    telefono = datiPrivati[nomeClean].telefono.replace(/[\s-]/g, '');
                }

                let ritardo = "";
                if (dati.notaCliente) {
                    const matchRitWord = dati.notaCliente.match(/ritardo[^0-9]*([0-9]+)/i);
                    if (matchRitWord) {
                        ritardo = matchRitWord[1];
                    } else {
                        const matchGenericNum = dati.notaCliente.match(/\b([0-9]{1,3})\b/);
                        if (matchGenericNum) ritardo = matchGenericNum[1];
                    }
                }

                if (telefono && ritardo) {
                    let giorni = parseInt(ritardo); let messaggio = "";
                    const nomeFormattato = nomeCliente.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                    if (giorni <= 9) messaggio = `${saluto} ${nomeFormattato}, ti contattiamo da Easybox per un breve promemoria: risulta un ritardo di ${giorni} giorni sul pagamento del tuo spazio. Ti ricordiamo che ti abbiamo già inviato il link con cui puoi saldare direttamente dal tuo cellulare tramite carta di credito. Se hai già provveduto, ti chiediamo di ignorare questa comunicazione. Restiamo a disposizione!`;
                    else if (giorni <= 25) messaggio = `${saluto} ${nomeFormattato}, ti contattiamo da Easybox. Notiamo che il ritardo sul pagamento del tuo spazio ha raggiunto ${giorni} giorni. Puoi utilizzare il link che hai già ricevuto per effettuare il saldo direttamente dal cellulare con carta di credito. Ti chiediamo gentilmente di regolarizzare la posizione al più presto.`;
                    else if (giorni <= 50) messaggio = `🚨 ${saluto} ${nomeFormattato}, da Easybox rileviamo un ritardo di ben ${giorni} giorni sul pagamento. Ti invitiamo ad utilizzare il link già inviato per saldare subito con carta di credito dal cellulare, o a contattarci con urgenza per regolarizzare la situazione.`;
                    else return;

                    let messaggioCodificato = encodeURIComponent(messaggio);
                    contenutoFile += `${telefono}|${messaggioCodificato}\r\n`;

                    let telWa = telefono;
                    if (telWa.startsWith('00')) telWa = '+' + telWa.substring(2);
                    if (!telWa.startsWith('+')) telWa = '+39' + telWa;
                    telWa = telWa.replace('+', '');

                    const linkWa = `https://wa.me/${telWa}?text=${messaggioCodificato}`;
                    const nomeSicuro = nomeClean.replace(/'/g, "\\'");

                    htmlLista += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; background: #f8f9fa; border-radius: 6px; margin-bottom: 8px; border-left: 4px solid #dc3545;">
                            <div style="text-align: left;">
                                <strong style="color: #333;">Box #${numStanza} - ${nomeFormattato}</strong><br>
                                <span style="font-size: 12px; color: #dc3545; font-weight: bold;">Ritardo: ${giorni} gg</span> <span style="font-size: 12px; color: #666;">(${telefono})</span>
                            </div>
                            <a href="${linkWa}" target="_blank" onclick="cancellaSingoloTelefono('${nomeSicuro}', this)" style="background-color: #25D366; color: white; padding: 8px 15px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: 0.2s;">Invia 💬</a>
                        </div>
                    `;
                    contatore++;
                }
            }
        });

        if (contatore === 0) { alert("Nessun cliente valido trovato nella tua rubrica locale in questo momento (né in scadenza né debitore)."); return; }

        window.fileWhatsappCorrente = contenutoFile;

        const overlay = document.createElement('div');
        overlay.id = 'modal-whatsapp-overlay';
        overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;`;

        const modal = document.createElement('div');
        modal.style.cssText = `background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); width: 90%; max-width: 500px; max-height: 85vh; overflow-y: auto; text-align: center;`;

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #25D366; padding-bottom: 10px; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #25D366;">💬 Invio WhatsApp (${contatore} Trovati)</h3>
                <button onclick="document.body.removeChild(document.getElementById('modal-whatsapp-overlay'))" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">✖</button>
            </div>
            <div style="background: #e9ecef; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
                <strong style="color: #333; display: block; margin-bottom: 10px;">💻 Sei al Computer? (Invio 100% Automatico)</strong>
                <button onclick="scaricaFileWhatsapp()" style="background-color: #007bff; color: white; border: none; padding: 12px 20px; font-size: 15px; font-weight: bold; border-radius: 6px; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">📥 SCARICA FILE PER MACRO EXCEL</button>
            </div>
            <div style="text-align: center; margin-bottom: 15px;">
                <strong style="color: #333; display: block; border-bottom: 1px solid #ccc; padding-bottom: 5px;">📱 Sei al Cellulare? (Invio Manuale Rapido)</strong>
            </div>
            <div style="display: flex; flex-direction: column;">
                ${htmlLista}
            </div>
            
            <div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 15px;">
                <button onclick="svuotaTelefoniLocali()" style="background-color: #dc3545; color: white; border: none; padding: 10px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">🗑️ Svuota tutti i numeri e Chiudi</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

    } catch (error) { console.error(error); alert("Errore lettura database."); }
};

window.scaricaFileWhatsapp = function () {
    if (!window.fileWhatsappCorrente) return;
    
    if (window.AndroidApp) {
        window.AndroidApp.salvaFileTxt("whatsapp_da_inviare.txt", window.fileWhatsappCorrente);
    } else {
        const blob = new Blob([window.fileWhatsappCorrente], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'whatsapp_da_inviare.txt';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    }

    if (confirm("✅ File elaborato con successo!\n\nVuoi eliminare TUTTI i numeri di cellulare dalla memoria per motivi di privacy?")) {
        window.svuotaTelefoniLocali();
    }
};

window.cancellaSingoloTelefono = function (nomeCliente, btnElement) {
    let datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
    if (datiPrivati[nomeCliente] && datiPrivati[nomeCliente].telefono) {
        delete datiPrivati[nomeCliente].telefono;
        localStorage.setItem('dati_privati_clienti', JSON.stringify(datiPrivati));
    }
    btnElement.innerHTML = "✅ Cancellato";
    btnElement.style.backgroundColor = "#6c757d";
    btnElement.style.pointerEvents = "none";
};

window.svuotaTelefoniLocali = function () {
    let datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
    let count = 0;
    for (let cliente in datiPrivati) {
        if (datiPrivati[cliente].telefono) {
            delete datiPrivati[cliente].telefono;
            count++;
        }
    }
    localStorage.setItem('dati_privati_clienti', JSON.stringify(datiPrivati));

    const modal = document.getElementById('modal-whatsapp-overlay');
    if (modal) document.body.removeChild(modal);

    if (count > 0) alert(`Privacy protetta: ${count} numeri di cellulare sono stati eliminati definitivamente dalla memoria locale!`);
};

// ==========================================
// 📧 GENERAZIONE FILE EMAIL E PANNELLO MODALE 
// ==========================================
window.generaFileEmail = async function () {
    try {
        const datiPaidAhead = JSON.parse(localStorage.getItem('dati_paid_ahead')) || {};
        const datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
        const giorniTarget = [3, 0, -1, -2, -6, -10, -17, -24, -28, -31, -34, -37, -40, -42, -44];
        
        let emailList = [];
        
        const firmaTestoPlano = "\n\n--\nEasybox Milano Centro\nVia E. Porro, 2 (ang. Viale Lancetti 6) - Milano\nTel: +39 02 81127477\nmilanocentro@easybox.it\neasybox.it\n\nInformativa sulla privacy e sulla riservatezza\nLe informazioni trasmesse sono destinate esclusivamente al destinatario indicato e possono contenere materiale riservato e/o confidenziale. È vietato qualsiasi esame, ritrasmissione, diffusione o altro utilizzo di tali informazioni da parte di persone o entità diverse dal destinatario previsto. Se avete ricevuto questo messaggio per errore, vi preghiamo di contattare il mittente e di eliminare il materiale da qualsiasi computer.";
        
        for (let numStanza in datiPaidAhead) {
            const infoFin = datiPaidAhead[numStanza];
            const gg = infoFin.giorniPaidAhead;

            if (giorniTarget.includes(gg)) {
                let nomeCliente = infoFin.cliente;
                const nomeClean = nomeCliente.toLowerCase();
                let indirizzoEmail = datiPrivati[nomeClean]?.email || "";

                if (indirizzoEmail) {
                    const nomeFormattato = nomeCliente.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    let oggetto = "";
                    let messaggioIT = "";
                    let messaggioEN = "";
                    
                    let testoImporto = "";
                    let testoImportoEN = "";
                    if (infoFin.importoDue > 0 && gg < 0) {
                        testoImporto = `\n\nImporto da saldare: € ${infoFin.importoDue.toFixed(2)}`;
                        testoImportoEN = `\n\nAmount due: € ${infoFin.importoDue.toFixed(2)}`;
                    }

                    const fraseChiamataIT = "Abbiamo provato a contattarti telefonicamente ma senza successo.\n\n";
                    const fraseChiamataEN = "We tried to contact you by phone but without success.\n\n";

                    if (gg === 3 || gg === 0) {
                        let scadenzaStrIT = (gg === 3) ? "tra 3 giorni" : "nella giornata di oggi";
                        let scadenzaStrEN = (gg === 3) ? "in 3 days" : "today";
                        oggetto = `Easybox - Avviso scadenza canone box / Notice of box rental expiration`;
                        messaggioIT = `Buongiorno ${nomeFormattato},\n\nTi informiamo che il canone del tuo box scadrà ${scadenzaStrIT}.\n\nSe hai già scelto il RID come metodo di pagamento automatico, ti preghiamo di non considerare questa mail.\nSe invece desideri comunicarci il tuo IBAN per agganciare il metodo diretto, contattaci allo 0281127477.\n\nCordiali saluti,\nIl Team Easybox`;
                        messaggioEN = `Dear ${nomeFormattato},\n\nWe inform you that the rental fee for your unit will expire ${scadenzaStrEN}.\n\nIf you have already chosen direct debit (RID) as your automatic payment method, please ignore this email.\nIf you wish to provide us with your IBAN to set up direct debit, please contact us at 0281127477.\n\nBest regards,\nThe Easybox Team`;
                    }
                    else if (gg === -1) {
                        oggetto = `Easybox - Canone scaduto e preavviso blocco accessi / Overdue payment and access block notice`;
                        messaggioIT = `Buongiorno ${nomeFormattato},\n\n${fraseChiamataIT}Ti informiamo che il canone del tuo box è scaduto. Ti avvisiamo che da domani i codici di accesso alla struttura verranno bloccati.${testoImporto}\n\nTi ricordiamo che hai già ricevuto il link per effettuare il saldo della mensilità in modo rapido e sicuro.\n\nCordiali saluti,\nIl Team Easybox`;
                        messaggioEN = `Dear ${nomeFormattato},\n\n${fraseChiamataEN}We inform you that your unit's rental fee is overdue. Please be advised that starting tomorrow, your access codes to the facility will be blocked.${testoImportoEN}\n\nWe remind you that you have already received the link to securely and quickly pay your monthly fee.\n\nBest regards,\nThe Easybox Team`;
                    }
                    else if (gg === -2 || gg === -6 || gg === -17) {
                        oggetto = `Easybox - Sollecito di pagamento / Payment reminder`;
                        messaggioIT = `Buongiorno ${nomeFormattato},\n\n${fraseChiamataIT}Ti contattiamo per ricordarti che il canone del tuo box risulta scaduto.${testoImporto}\n\nTi invitiamo a regolarizzare la tua posizione utilizzando il link per il saldo che hai già ricevuto.\n\nCordiali saluti,\nIl Team Easybox`;
                        messaggioEN = `Dear ${nomeFormattato},\n\n${fraseChiamataEN}We are contacting you to remind you that your unit's rental fee is overdue.${testoImportoEN}\n\nWe invite you to regularize your position using the payment link you have already received.\n\nBest regards,\nThe Easybox Team`;
                    }
                    else if (gg === -10 || gg === -24 || gg === -28 || gg === -31 || gg === -34 || gg === -37 || gg === -40 || gg === -42) {
                        oggetto = `Easybox - Sollecito pagamento e blocco accesso / Payment reminder and access block`;
                        messaggioIT = `Buongiorno ${nomeFormattato},\n\n${fraseChiamataIT}Ti ricordiamo che il canone del tuo box risulta scaduto e che l'accesso alla struttura è attualmente bloccato.${testoImporto}\n\nTi invitiamo ad utilizzare il link che hai già ricevuto per effettuare il saldo.\n\nCordiali saluti,\nIl Team Easybox`;
                        messaggioEN = `Dear ${nomeFormattato},\n\n${fraseChiamataEN}We remind you that your unit's rental fee is overdue and access to the facility is currently blocked.${testoImportoEN}\n\nWe invite you to use the link you have already received to make the payment.\n\nBest regards,\nThe Easybox Team`;
                    }
                    else if (gg === -44) {
                        oggetto = `Easybox - PREAVVISO CHIUSURA CONTRATTO / CONTRACT TERMINATION NOTICE`;
                        messaggioIT = `Buongiorno ${nomeFormattato},\n\n${fraseChiamataIT}Ti ricordiamo che hai già ricevuto il link per il pagamento. Ti informiamo che al 50° giorno di ritardo il contratto verrà chiuso e la pratica verrà passata all'ufficio recupero crediti.${testoImporto}\n\nSe desideri formalizzare e regolarizzare la situazione, puoi effettuare il saldo o contattarci urgentemente allo 0281127477.\n\nCordiali saluti,\nLa Direzione Easybox`;
                        messaggioEN = `Dear ${nomeFormattato},\n\n${fraseChiamataEN}We remind you that you have already received the payment link. Please be informed that on the 50th day of delay, the contract will be closed and the file will be transferred to a debt collection agency.${testoImportoEN}\n\nIf you wish to regularize your situation, you can make the payment or contact us urgently at 0281127477.\n\nBest regards,\nEasybox Management`;
                    }

                    let messaggioCompleto = `${messaggioIT}\n\n---\n\n${messaggioEN}`;
                    
                    emailList.push({
                        stanza: numStanza,
                        cliente: nomeFormattato,
                        emailReale: indirizzoEmail,
                        giorni: gg,
                        oggetto: oggetto,
                        corpoTxt: messaggioCompleto.replace(/\n/g, "<br>"),
                        corpoMailto: messaggioCompleto + firmaTestoPlano
                    });
                }
            }
        }

        if (emailList.length === 0) {
            alert("Nessuna mail generata. Nessun cliente oggi si trova nei giorni esatti di scadenza oppure mancano le email locali.");
            return;
        }

        window.emailListCorrente = emailList;

        let htmlLista = "";
        emailList.forEach(item => {
            const nomeSicuro = item.cliente.replace(/'/g, "\\'");
            const coloreGiorni = item.giorni < 0 ? '#dc3545' : '#28a745';
            
             const linkInvio = `mailto:${item.emailReale}?subject=${encodeURIComponent(item.oggetto)}&body=${encodeURIComponent(item.corpoMailto)}`;
             const testoBottone = "Invia con Outlook 📧";

            htmlLista += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee; background: #f8f9fa; border-radius: 6px; margin-bottom: 8px;">
                    <div style="text-align: left;">
                        <strong style="color: #333;">Box #${item.stanza} - ${item.cliente}</strong><br>
                        <span style="font-size: 12px; color: ${coloreGiorni}; font-weight: bold;">Giorni: ${item.giorni}</span> <span style="font-size: 12px; color: #666;">(${item.emailReale})</span>
                    </div>
                    <a href="${linkInvio}" target="_blank" onclick="cancellaSingolaEmail('${nomeSicuro}', this)" style="background-color: #0078D4; color: white; padding: 8px 15px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: 0.2s;">${testoBottone}</a>
                </div>
            `;
        });

        const overlay = document.createElement('div');
        overlay.id = 'modal-email-overlay';
        overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;`;

        const modal = document.createElement('div');
        modal.style.cssText = `background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); width: 90%; max-width: 500px; max-height: 85vh; overflow-y: auto; text-align: center;`;

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0078D4; padding-bottom: 10px; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #0078D4;">📧 Invio Email (${emailList.length} Trovate)</h3>
                <button onclick="document.body.removeChild(document.getElementById('modal-email-overlay'))" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">✖</button>
            </div>
            
            <div style="background: #e9ecef; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
                <strong style="color: #333; display: block; margin-bottom: 10px;">💻 Azioni per Macro Excel (PC)</strong>
                <button onclick="scaricaFileEmail(false)" style="background-color: #28a745; color: white; border: none; padding: 10px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; width: 100%; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">📥 SCARICA PER CLIENTI REALI</button>
                <button onclick="scaricaFileEmail(true)" style="background-color: #ffc107; color: black; border: none; padding: 10px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">🧪 SCARICA MODALITÀ TEST (File TXT)</button>
            </div>

            <div style="text-align: center; margin-bottom: 15px;">
                <strong style="color: #333; display: block; border-bottom: 1px solid #ccc; padding-bottom: 5px;">📱 Invio Singolo Manuale</strong>
            </div>
            
            <div style="display: flex; flex-direction: column;">
                ${htmlLista}
            </div>
            
            <div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 15px;">
                <button onclick="svuotaEmailLocali()" style="background-color: #dc3545; color: white; border: none; padding: 10px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">🗑️ Svuota tutte le Email Locali e Chiudi</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

    } catch (error) {
        console.error(error);
        alert("Errore durante la generazione delle email. Controlla di aver caricato il file Paid Ahead.");
    }
};

window.scaricaFileEmail = function(isTest) {
    if (!window.emailListCorrente) return;
    
    let contenutoFile = "";
    let emailDestinazioneDefault = "spinelli291082@gmail.com";
    
    if (isTest) {
        let testEmail = prompt("MODALITÀ TEST: Inserisci l'indirizzo email a cui inviare tutte le comunicazioni di prova in questo file:", emailDestinazioneDefault);
        if (!testEmail || testEmail.trim() === "") {
            alert("Operazione annullata.");
            return;
        }
        emailDestinazioneDefault = testEmail.trim();
    }
    
    window.emailListCorrente.forEach(item => {
        const dest = isTest ? emailDestinazioneDefault : item.emailReale;
        contenutoFile += `${dest}|${item.oggetto}|${item.corpoTxt}\r\n`;
    });
    
    const nomeFile = isTest ? 'email_calendario_bilingue_TEST.txt' : 'email_calendario_bilingue.txt';

    if (window.AndroidApp) {
        window.AndroidApp.salvaFileTxt(nomeFile, contenutoFile);
    } else {
        const blob = new Blob([contenutoFile], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; 
        a.download = nomeFile;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    }
    
    if (!isTest) {
         if (confirm("✅ File scaricato con successo!\n\nVuoi eliminare TUTTI gli indirizzi email dalla memoria di questo PC per motivi di privacy?")) {
             window.svuotaEmailLocali();
         }
    } else {
         alert(`✅ File di TEST generato!\nTutte le mail nel file scaricato punteranno a: ${emailDestinazioneDefault}`);
    }
};

window.cancellaSingolaEmail = function (nomeCliente, btnElement) {
    const nomeClean = nomeCliente.toLowerCase();
    let datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
    if (datiPrivati[nomeClean] && datiPrivati[nomeClean].email) {
        delete datiPrivati[nomeClean].email;
        localStorage.setItem('dati_privati_clienti', JSON.stringify(datiPrivati));
    }
    btnElement.innerHTML = "✅ Mail Aperta";
    btnElement.style.backgroundColor = "#6c757d";
    btnElement.style.pointerEvents = "none";
};

window.svuotaEmailLocali = function () {
    let datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
    let count = 0;
    for (let cliente in datiPrivati) {
        if (datiPrivati[cliente].email) {
            delete datiPrivati[cliente].email;
            count++;
        }
    }
    localStorage.setItem('dati_privati_clienti', JSON.stringify(datiPrivati));

    const modal = document.getElementById('modal-email-overlay');
    if (modal) document.body.removeChild(modal);

    if (count > 0) alert(`Privacy protetta: ${count} indirizzi email sono stati eliminati definitivamente dalla memoria locale!`);
    
    localStorage.setItem('ultimo_invio_email_debitori', new Date().toDateString());
    if (typeof window.controllaAllarmeEmailDebitori === 'function') window.controllaAllarmeEmailDebitori();
};

// ==========================================
// 10. GESTIONE STANZE, NOTE E PANNELLO STATO
// ==========================================
window.chiudiModalNota = function () {
    document.getElementById('modal-note').style.display = 'none';
};

window.chiudiPannelloControllo = function () {
    const pannello = document.getElementById('pannello-controllo');
    if (pannello) pannello.classList.add('nascosto');
    stanzaCorrente = null;
};

window.salvaNotaFirebase = async function () {
    if (!stanzaCorrente) return;
    const tFissa = document.getElementById('note-fisse').value;
    const tCliente = document.getElementById('note-cliente').value;
    const docRef = doc(db, "stanze", stanzaCorrente.id);

    try {
        await setDoc(docRef, { notaFissa: tFissa, notaCliente: tCliente }, { merge: true });
        stanzaCorrente.setAttribute('data-nota-fissa', tFissa);
        stanzaCorrente.setAttribute('data-nota-cliente', tCliente);
        window.chiudiModalNota();
    } catch (error) {
        console.error("Errore salvataggio nota:", error);
        alert("Errore durante il salvataggio della nota.");
    }
};

window.cambiaStato = async function (nuovoStatoClass) {
    if (stanzaCorrente) {
        const docRef = doc(db, "stanze", stanzaCorrente.id);
        try {
            await setDoc(docRef, { stato: nuovoStatoClass }, { merge: true });
            const pannello = document.getElementById('pannello-controllo');
            if (pannello) pannello.classList.add('nascosto');
            stanzaCorrente = null;
        } catch (error) {
            console.error("Errore di scrittura DB:", error);
            alert("Errore nell'aggiornamento dello stato.");
        }
    }
};

window.impostaPulizia = async function (daPulire) {
    if (!stanzaCorrente) return;
    const docRef = doc(db, "stanze", stanzaCorrente.id);
    try {
        await setDoc(docRef, { daPulire: daPulire }, { merge: true });

        if (daPulire) {
            const numStanza = stanzaCorrente.getAttribute('data-nome') || stanzaCorrente.id;
            const contenitorePiano = stanzaCorrente.closest('.container-mappa');
            const mappaPiani = {
                'map-centro-pt': 'Piano Terra', 'map-centro-p-1': 'Piano -1',
                'map-centro-p1': 'Piano 1', 'map-centro-p-2': 'Piano -2',
                'map-centro-p-3': 'Piano -3', 'map-centro-p-4': 'Piano -4'
            };
            const nomePiano = contenitorePiano ? (mappaPiani[contenitorePiano.id] || contenitorePiano.id) : "Piano Sconosciuto";

            const email = "milanocentro@easybox.it";
            const subject = encodeURIComponent("BOX DA PULIRE");
            const body = encodeURIComponent(`Si richiede la pulizia per la stanza n° ${numStanza}\nPosizione: ${nomePiano}`);
            window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        }

        const pannello = document.getElementById('pannello-controllo');
        if (pannello) pannello.classList.add('nascosto');
        stanzaCorrente = null;
    } catch (error) {
        console.error("Errore imposta pulizia:", error);
    }
};

// ==========================================
// INIZIALIZZAZIONE DELLE STANZE 
// ==========================================
function inizializzaStanze() {
    const stanze = document.querySelectorAll('.stanza');
    const pannello = document.getElementById('pannello-controllo');
    const titoloPannello = document.getElementById('nome-stanza-selezionata');

    stanze.forEach(stanza => {
        stanza.addEventListener('click', function (e) {
            if (window.isAuditModeActive) {
                e.preventDefault();
                e.stopPropagation();
                window.apriModaleAuditStanza(this);
                return;
            }

            stanzaCorrente = this;
            const nomeStanza = this.getAttribute('data-nome');
            if (titoloPannello) titoloPannello.textContent = `Gestisci Stanza: #${nomeStanza}`;
            if (pannello) pannello.classList.remove('nascosto');
        });

        stanza.addEventListener('dblclick', function () {
            stanzaCorrente = this;
            const nomeStanza = this.getAttribute('data-nome');

            const notaFissa = this.getAttribute('data-nota-fissa') || '';
            const notaCliente = this.getAttribute('data-nota-cliente') || '';
            const cliente = this.getAttribute('data-cliente') || 'Nessun dato';
            const dataPartenza = this.getAttribute('data-partenza') || 'Nessun dato';

            document.getElementById('titolo-modal-nota').textContent = `Note Stanza: #${nomeStanza}`;
            document.getElementById('note-fisse').value = notaFissa;
            document.getElementById('note-cliente').value = notaCliente;

            const contenitoreCliente = document.getElementById('testo-cliente');
            if (contenitoreCliente) contenitoreCliente.textContent = cliente;

            const contenitoreDataPartenza = document.getElementById('testo-data-partenza');
            if (contenitoreDataPartenza) contenitoreDataPartenza.textContent = dataPartenza;

            const bloccoPrivati = document.getElementById('blocco-dati-privati');
            const testoEmail = document.getElementById('testo-email-privata');
            const testoTel = document.getElementById('testo-tel-privato');

            if (cliente && cliente !== 'Nessun dato') {
                const nomeClean = cliente.replace(/cliente:/i, '').trim().toLowerCase();
                const datiPrivati = JSON.parse(localStorage.getItem('dati_privati_clienti')) || {};
                const info = datiPrivati[nomeClean];

                if (info && (info.email || info.telefono)) {
                    testoEmail.textContent = info.email || 'Nessuna email salvata';
                    testoTel.textContent = info.telefono || 'Nessun telefono salvato';
                    bloccoPrivati.style.display = 'block';
                } else {
                    bloccoPrivati.style.display = 'none';
                }
            } else {
                bloccoPrivati.style.display = 'none';
            }

            document.getElementById('modal-note').style.display = 'flex';
        });
    });
}

window.gestisciSimboloPulizia = function (stanza, daPulire) {
    const svg = stanza.closest('svg');
    const idSimbolo = `pulizia-${stanza.id}`;
    let simbolo = document.getElementById(idSimbolo);

    if (daPulire) {
        if (!simbolo) {
            const x = parseFloat(stanza.getAttribute('x'));
            const y = parseFloat(stanza.getAttribute('y'));
            const width = parseFloat(stanza.getAttribute('width'));
            const height = parseFloat(stanza.getAttribute('height'));
            const imgSize = 35;

            simbolo = document.createElementNS("http://www.w3.org/2000/svg", "image");
            simbolo.setAttribute("id", idSimbolo);
            simbolo.setAttribute("x", x + (width / 2) - (imgSize / 2));
            simbolo.setAttribute("y", y + (height / 2) - (imgSize / 2));
            simbolo.setAttribute("width", imgSize);
            simbolo.setAttribute("height", imgSize);
            simbolo.setAttribute("href", "spazzare-e-passare-la-scopa-immagine-animata-0004.gif");
            simbolo.setAttribute("class", "icona-pulizia");

            svg.appendChild(simbolo);
        }
    } else {
        if (simbolo) simbolo.remove();
    }
};

function disegnaMetrature() {
    document.querySelectorAll('.stanza').forEach(stanza => {
        const mq = stanza.getAttribute('data-mq');
        if (mq && mq !== "" && mq !== "1" && mq !== "2" && mq !== "0.5" && mq !== "1.5") {
            const svg = stanza.closest('svg');
            const x = parseFloat(stanza.getAttribute('x'));
            const y = parseFloat(stanza.getAttribute('y'));
            const width = parseFloat(stanza.getAttribute('width'));
            const height = parseFloat(stanza.getAttribute('height'));

            if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", x + (width / 2));
                text.setAttribute("y", y + (height / 6));
                text.setAttribute("class", "testo-mq");
                text.textContent = mq + " mq";
                svg.appendChild(text);
            }
        }
    });
}

document.getElementById('btn-libera')?.addEventListener('click', () => window.cambiaStato(''));
document.getElementById('btn-occupata')?.addEventListener('click', () => window.cambiaStato('occupata'));
document.getElementById('btn-debitore')?.addEventListener('click', () => window.cambiaStato('debitore'));
document.getElementById('btn-company')?.addEventListener('click', () => window.cambiaStato('company'));
document.getElementById('btn-damaged')?.addEventListener('click', () => window.cambiaStato('damaged'));
document.getElementById('btn-maintenance')?.addEventListener('click', () => window.cambiaStato('maintenance'));
document.getElementById('btn-movein')?.addEventListener('click', () => window.cambiaStato('movein'));
document.getElementById('btn-held')?.addEventListener('click', () => window.cambiaStato('held'));
document.getElementById('btn-da-pulire')?.addEventListener('click', () => window.impostaPulizia(true));
document.getElementById('btn-pulita')?.addEventListener('click', () => window.impostaPulizia(false));

const boxData = document.getElementById('data-odierna');
if (boxData) {
    const opzioniData = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    let dataOggi = new Date().toLocaleDateString('it-IT', opzioniData);
    dataOggi = dataOggi.charAt(0).toUpperCase() + dataOggi.slice(1);
    boxData.innerHTML = `🗓️ Oggi è <strong>${dataOggi}</strong>`;
}

inizializzaStanze();
disegnaMetrature();
if (typeof window.selezionaFiliale === 'function') {
    window.selezionaFiliale('centro', document.getElementById('btn-centro-main'));
}

// ==========================================
// MOTORE PANNELLO "CARICA MAPPE" (ADMIN)
// ==========================================
let archivioExcelAdmin = {};
let isDrawModeActive = false;
let adminStartX, adminStartY, adminTempRect, adminStanzaInCorso;

document.getElementById('file-excel-admin')?.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        archivioExcelAdmin = {};
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const foglio = workbook.Sheets[workbook.SheetNames[0]];
        const righe = XLSX.utils.sheet_to_json(foglio, { header: 1 });

        let count = 0;
        for (let i = 1; i < righe.length; i++) {
            if (righe[i] && righe[i][0] && String(righe[i][0]).trim() !== "") {
                let num = String(righe[i][0]).trim().toLowerCase();
                let mq = String(righe[i][1] || "0").trim().replace(',', '.');
                archivioExcelAdmin[num] = mq;
                count++;
            }
        }
        const statoElem = document.getElementById('stato-excel-admin');
        if (statoElem) statoElem.innerHTML = `✅ Caricati ${count} box!`;
    };
    reader.readAsArrayBuffer(file);
});

window.analizzaMappaLive = function () {
    if (Object.keys(archivioExcelAdmin).length === 0) { alert("Carica prima l'Excel!"); return; }

    const tbody = document.getElementById('admin-tbody');
    if (!tbody) return;
    tbody.innerHTML = "";
    let dataMappa = {};

    document.querySelectorAll('.stanza').forEach(rect => {
        let nome = rect.getAttribute('data-nome') || rect.id.replace('stanza-centro-', '');
        dataMappa[nome.toLowerCase()] = (rect.getAttribute('data-mq') || "0").replace(',', '.');
    });

    let tutte = new Set([...Object.keys(archivioExcelAdmin), ...Object.keys(dataMappa)]);
    let stanze = Array.from(tutte).sort((a, b) => parseInt(a) - parseInt(b));

    let cOk = 0, cErr = 0, cMissMap = 0, cMissExc = 0;

    stanze.forEach(s => {
        let mEx = archivioExcelAdmin[s];
        let mMap = dataMappa[s];
        let row = document.createElement('tr');
        let stato = "";

        if (mEx !== undefined && mMap !== undefined) {
            if (mEx === mMap) { stato = "<span style='color:green'>✅ OK</span>"; cOk++; }
            else { stato = "<span style='color:red'>❌ Mq Errati</span>"; cErr++; }
        } else if (mEx !== undefined && mMap === undefined) {
            stato = "<span style='color:orange'>⚠️ Manca su Mappa</span>"; mMap = "-"; cMissMap++;
        } else {
            stato = "<span style='color:gray'>⚠️ Manca in Excel</span>"; mEx = "-"; cMissExc++;
        }

        row.innerHTML = `<td style="border-bottom: 1px solid #ddd; padding: 5px;">${s.toUpperCase()}</td>
                         <td style="border-bottom: 1px solid #ddd; padding: 5px;">${mEx}</td>
                         <td style="border-bottom: 1px solid #ddd; padding: 5px;">${mMap}</td>
                         <td style="border-bottom: 1px solid #ddd; padding: 5px;">${stato}</td>`;
        tbody.appendChild(row);
    });

    document.getElementById('admin-badges').innerHTML = `
        <span style="color:green">✅ OK: ${cOk}</span> | 
        <span style="color:red">❌ Errati: ${cErr}</span> | 
        <span style="color:orange">⚠️ Da tracciare: ${cMissMap}</span>`;
    document.getElementById('admin-report').style.display = 'block';
};

window.correggiMqLive = function () {
    if (Object.keys(archivioExcelAdmin).length === 0) { alert("Carica prima l'Excel!"); return; }
    let modificate = 0;
    document.querySelectorAll('.stanza').forEach(rect => {
        let nome = rect.getAttribute('data-nome') || rect.id.replace('stanza-centro-', '');
        let mEx = archivioExcelAdmin[nome.toLowerCase()];
        if (mEx && rect.getAttribute('data-mq') !== mEx) {
            rect.setAttribute('data-mq', mEx);
            modificate++;
        }
    });
    alert(`⚡ Operazione completata! Aggiornati i Mq di ${modificate} stanze.`);
    window.analizzaMappaLive();
};

window.toggleDrawMode = function () {
    const btn = document.getElementById('btn-draw-mode');
    const contenitoriMappe = document.querySelectorAll('.container-mappa');

    isDrawModeActive = !isDrawModeActive;

    if (isDrawModeActive) {
        if (btn) { btn.style.backgroundColor = '#28a745'; btn.innerHTML = '✅ DISEGNO ATTIVO (Clicca mappa)'; }
        contenitoriMappe.forEach(c => c.style.cursor = 'crosshair');
        alert("ATTENZIONE: Modalità Disegno Attiva!\n1. Clicca e trascina sulla piantina per creare il box.\n2. Rilascia e conferma il numero.\n3. Clicca di nuovo sul corridoio per impostare l'ingresso.");
    } else {
        if (btn) { btn.style.backgroundColor = '#dc3545'; btn.innerHTML = '✏️ ATTIVA DISEGNO MAPPA'; }
        contenitoriMappe.forEach(c => c.style.cursor = 'default');
    }
};

document.querySelectorAll('.container-mappa svg').forEach(svgMap => {
    svgMap.addEventListener('mousedown', function (e) {
        if (!isDrawModeActive) return;
        const pt = svgMap.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const svgP = pt.matrixTransform(svgMap.getScreenCTM().inverse());

        if (adminStanzaInCorso) {
            const s = adminStanzaInCorso;
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("id", `stanza-centro-${s.nome}`);
            rect.setAttribute("class", "stanza");
            rect.setAttribute("x", s.x);
            rect.setAttribute("y", s.y);
            rect.setAttribute("width", s.w);
            rect.setAttribute("height", s.h);
            rect.setAttribute("data-nome", s.nome);
            rect.setAttribute("data-mq", s.mq);
            rect.setAttribute("data-nodo-x", Math.round(svgP.x));
            rect.setAttribute("data-nodo-y", Math.round(svgP.y));

            rect.style.fill = "#d6d8db";
            rect.style.stroke = "#333";
            rect.style.strokeWidth = "1";

            svgMap.appendChild(rect);
            if (adminTempRect) adminTempRect.remove();
            adminStanzaInCorso = null;

        } else {
            adminStartX = svgP.x;
            adminStartY = svgP.y;
            adminTempRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            adminTempRect.setAttribute("fill", "rgba(0, 123, 255, 0.4)");
            adminTempRect.setAttribute("stroke", "#007bff");
            adminTempRect.setAttribute("stroke-width", "2");
            adminTempRect.setAttribute("x", adminStartX);
            adminTempRect.setAttribute("y", adminStartY);
            svgMap.appendChild(adminTempRect);
        }
    });

    svgMap.addEventListener('mousemove', function (e) {
        if (!isDrawModeActive || !adminTempRect || adminStanzaInCorso) return;
        const pt = svgMap.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const svgP = pt.matrixTransform(svgMap.getScreenCTM().inverse());

        const x = Math.min(adminStartX, svgP.x);
        const y = Math.min(adminStartY, svgP.y);
        const w = Math.abs(svgP.x - adminStartX);
        const h = Math.abs(svgP.y - adminStartY);

        adminTempRect.setAttribute("x", Math.round(x));
        adminTempRect.setAttribute("y", Math.round(y));
        adminTempRect.setAttribute("width", Math.round(w));
        adminTempRect.setAttribute("height", Math.round(h));
    });

    svgMap.addEventListener('mouseup', function () {
        if (!isDrawModeActive || !adminTempRect || adminStanzaInCorso) return;

        let numStanza = "";
        const chkAuto = document.getElementById('admin-auto-inc')?.checked;
        const inputNum = document.getElementById('admin-next-num');

        if (chkAuto && inputNum && inputNum.value) {
            numStanza = String(inputNum.value).trim();
            inputNum.value = parseInt(numStanza) + 1;
        } else {
            numStanza = prompt("Inserisci numero Stanza:");
        }

        if (numStanza) {
            let mq = archivioExcelAdmin[numStanza.toLowerCase()];
            if (!mq) mq = prompt(`Mq per ${numStanza} non trovati. Inserisci a mano:`) || "1";

            adminStanzaInCorso = {
                nome: numStanza, mq: mq,
                x: adminTempRect.getAttribute("x"), y: adminTempRect.getAttribute("y"),
                w: adminTempRect.getAttribute("width"), h: adminTempRect.getAttribute("height")
            };
            adminTempRect.setAttribute("fill", "rgba(40, 167, 69, 0.4)");
            adminTempRect.setAttribute("stroke", "#28a745");
        } else {
            adminTempRect.remove();
            adminTempRect = null;
        }
    });
});

window.esportaCodiceSvgAggiornato = function () {
    let fileContent = "<!-- COPIA E INCOLLA I BLOCCHI SOTTOSTANTI NELLE RISPETTIVE MAPPE DEL TUO FILE HTML -->\n\n";

    document.querySelectorAll('.container-mappa').forEach(mapContainer => {
        const mapId = mapContainer.id;
        fileContent += `====================================================\n`;
        fileContent += `MAPPA: ${mapId.toUpperCase()}\n`;
        fileContent += `====================================================\n\n`;

        mapContainer.querySelectorAll('.stanza').forEach(rect => {
            let rectPulito = rect.cloneNode(true);
            rectPulito.style.removeProperty('fill');
            rectPulito.style.removeProperty('stroke');
            rectPulito.style.removeProperty('stroke-width');
            rectPulito.setAttribute('class', 'stanza');

            rectPulito.removeAttribute('data-cliente');
            rectPulito.removeAttribute('data-partenza');
            rectPulito.removeAttribute('data-nota-cliente');
            rectPulito.removeAttribute('data-nota-fissa');
            rectPulito.removeAttribute('data-f');
            rectPulito.removeAttribute('data-dapulire');

            fileContent += rectPulito.outerHTML + "\n";
        });
        fileContent += `\n\n`;
    });

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Mappe_Pulite_Easybox.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    alert("File pulito scaricato! Ora conterrà solo l'architettura delle stanze, senza i dati sensibili dei clienti.");
};

// ==========================================
// 14. LOGICA LOCK CHECK AUDIT
// ==========================================
window.isAuditModeActive = false;
window.auditData = {};
window.auditInitialStates = {};
window.stanzaAuditCorrente = null;
window.sceltaAuditCorrente = "";

window.apriMenuAudit = function () {
    const currentUser = firebase.auth().currentUser;
    const email = currentUser ? currentUser.email.toLowerCase().trim() : '';

    if (email !== 'spinelli291082@gmail.com' && email !== 'gdesogus@easybox.it') {
        alert("Accesso negato. Solo l'amministratore o l'account autorizzato possono avviare l'Audit.");
        return;
    }
    document.getElementById('modal-audit-main').style.display = 'flex';
};

window.startAudit = function () {
    window.isAuditModeActive = true;
    window.auditData = {};
    window.auditInitialStates = {};

    document.querySelectorAll('.stanza').forEach(stanza => {
        const num = stanza.getAttribute('data-nome') || stanza.id.replace('stanza-centro-', '');
        const classi = Array.from(stanza.classList);
        const statiValidi = ['occupata', 'debitore', 'company', 'damaged', 'maintenance', 'movein', 'held'];
        const statoTrovato = classi.find(c => statiValidi.includes(c));
        window.auditInitialStates[num] = statoTrovato ? statoTrovato : "libera";
    });

    const btn = document.getElementById('btn-lock-check');
    btn.style.animation = "ring-pulse 2s infinite";
    btn.style.backgroundColor = "#dc3545";

    document.getElementById('modal-audit-main').style.display = 'none';
    alert("▶️ REGISTRAZIONE AVVIATA!\n\nClicca una volta sui box sulla mappa per registrare le anomalie dei lucchetti.");
};

window.statoAuditSelezionato = null;

window.apriModaleAuditStanza = function (stanzaEl) {
    window.stanzaAuditCorrente = stanzaEl;
    const nomeStanza = stanzaEl.getAttribute('data-nome');
    document.getElementById('titolo-audit-stanza').textContent = `LOCK CHECK - Box #${nomeStanza}`;

    document.getElementById('audit-step-1').style.display = 'block';
    document.getElementById('audit-step-2').style.display = 'none';
    document.getElementById('audit-campo-nota').style.display = 'none';
    document.getElementById('audit-campo-stato').style.display = 'none';
    document.getElementById('nota-audit').value = "";
    window.statoAuditSelezionato = null;

    document.querySelectorAll('#audit-campo-stato .btn-stato').forEach(btn => {
        btn.style.border = "none";
        btn.style.opacity = "1";
    });

    document.getElementById('modal-audit-stanza').style.display = 'flex';
};

window.chiudiModaleAuditStanza = function () {
    document.getElementById('modal-audit-stanza').style.display = 'none';
    window.stanzaAuditCorrente = null;
};

window.selezionaSceltaAudit = function (scelta) {
    window.sceltaAuditCorrente = scelta;
    document.getElementById('audit-scelta-testo').textContent = scelta;
    document.getElementById('audit-step-1').style.display = 'none';
    document.getElementById('audit-step-2').style.display = 'block';
};

window.mostraCampoNotaAudit = function () {
    const campo = document.getElementById('audit-campo-nota');
    campo.style.display = campo.style.display === 'none' ? 'block' : 'none';
};

window.mostraCambioStatoAudit = function () {
    const campo = document.getElementById('audit-campo-stato');
    campo.style.display = campo.style.display === 'none' ? 'block' : 'none';
};

window.impostaNuovoStatoAudit = function (nuovoStato, btnElement) {
    window.statoAuditSelezionato = nuovoStato;

    document.querySelectorAll('#audit-campo-stato .btn-stato').forEach(btn => {
        btn.style.border = "none";
        btn.style.opacity = "0.5";
    });
    btnElement.style.border = "3px solid black";
    btnElement.style.opacity = "1";
};

window.salvaAuditStanza = async function () {
    if (!window.stanzaAuditCorrente) return;
    const numStanza = window.stanzaAuditCorrente.getAttribute('data-nome');

    let notaInserita = document.getElementById('nota-audit').value.trim();

    window.auditData[numStanza] = {
        scelta: window.sceltaAuditCorrente,
        nota: notaInserita
    };

    const docRef = doc(db, "stanze", window.stanzaAuditCorrente.id);
    let datiDaAggiornare = {};
    let aggiornaDB = false;

    if (notaInserita !== "") {
        let notaAttuale = window.stanzaAuditCorrente.getAttribute('data-nota-cliente') || "";
        let nuovaNota = notaAttuale ? `${notaAttuale} | [AUDIT] ${notaInserita}` : `[AUDIT] ${notaInserita}`;
        datiDaAggiornare.notaCliente = nuovaNota;
        aggiornaDB = true;
    }

    if (window.statoAuditSelezionato !== null) {
        datiDaAggiornare.stato = window.statoAuditSelezionato === 'libera' ? '' : window.statoAuditSelezionato;
        aggiornaDB = true;

        const statiValidi = ['occupata', 'debitore', 'company', 'damaged', 'maintenance', 'movein', 'held', 'in-ritardo'];
        window.stanzaAuditCorrente.classList.remove(...statiValidi);
        if (window.statoAuditSelezionato !== 'libera') {
            window.stanzaAuditCorrente.classList.add(window.statoAuditSelezionato);
        }
    }

    if (aggiornaDB) {
        try {
            await setDoc(docRef, datiDaAggiornare, { merge: true });
        } catch (e) {
            console.error("Errore salvataggio Audit in Firebase:", e);
        }
    }

    chiudiModaleAuditStanza();
};

window.stopAudit = function () {
    if (!window.isAuditModeActive) {
        alert("L'Audit non è attualmente attivo.");
        return;
    }
    window.isAuditModeActive = false;

    const btn = document.getElementById('btn-lock-check');
    btn.style.animation = "none";
    btn.style.backgroundColor = "#6f42c1";
    document.getElementById('modal-audit-main').style.display = 'none';

    if (Object.keys(window.auditData).length === 0) {
        alert("⏹️ AUDIT TERMINATO.\nNessun box è stato modificato o registrato in questa sessione.");
        return;
    }

    generaReportAudit();
};

window.generaReportAudit = function () {
    const dataToExport = [];
    const dataOggiStr = new Date().toLocaleDateString('it-IT');
    let emailText = `Ciao,\nEcco il report del LOCK CHEK ODIT completato in data ${dataOggiStr}:\n\n`;

    const statiValidi = ['occupata', 'debitore', 'company', 'damaged', 'maintenance', 'movein', 'held', 'in-ritardo'];

    for (let numStanza in window.auditData) {
        const auditInfo = window.auditData[numStanza];

        let stanzaEl = document.querySelector(`.stanza[data-nome="${numStanza}"]`) || document.getElementById(`stanza-centro-${numStanza}`);
        let statoFinale = "libera";
        if (stanzaEl) {
            const classi = Array.from(stanzaEl.classList);
            const statoTrovato = classi.find(c => statiValidi.includes(c));
            if (statoTrovato) statoFinale = statoTrovato;
        }

        const statoIniziale = window.auditInitialStates[numStanza] || "libera";

        let checkStatus = "GIUSTO";
        let emailEsito = "STATUS GIUSTO";

        if (statoFinale !== statoIniziale) {
            checkStatus = "SBAGLIATO";
            emailEsito = `STATUS SBAGLIATO (DA ${statoIniziale.toUpperCase()} A ${statoFinale.toUpperCase()})`;
        }

        dataToExport.push({
            'N° Stanza': numStanza,
            'Scelta Odit': auditInfo.scelta,
            'Nota': auditInfo.nota || "-",
            'STATUS': checkStatus,
            'DA': statoIniziale.toUpperCase(),
            'A': statoFinale.toUpperCase()
        });

        emailText += `📦 Box #${numStanza}: ${auditInfo.scelta}\n`;
        if (auditInfo.nota) emailText += `   Nota: ${auditInfo.nota}\n`;
        emailText += `   Esito: ${emailEsito}\n\n`;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();

    worksheet['!cols'] = [
        { wch: 15 }, { wch: 30 }, { wch: 40 }, 
        { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Report Audit");

    const oggi = new Date();
    const timeString = `${oggi.getHours().toString().padStart(2, '0')}${oggi.getMinutes().toString().padStart(2, '0')}`;
    const fileString = `Lock_Check_Odit_${dataOggiStr.replace(/\//g, '-')}_${timeString}.xlsx`;
    XLSX.writeFile(workbook, fileString);

    const email = "gdesogus@easybox.it";
    const subject = encodeURIComponent(`Report LOCK CHEK ODIT - ${dataOggiStr}`);
    const body = encodeURIComponent(emailText);

    setTimeout(() => {
        alert("✅ Report Excel generato! Clicca OK per aprire il programma di posta e inviare il riepilogo.");
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    }, 800);

    window.auditData = {};
};

// ========================================================
// ⏰ ALLARME GIORNALIERO E NOTIFICHE PUSH 
// ========================================================
if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission();
}

window.controllaAllarmeEmailDebitori = function () {
    const btnGestioneDebitori = document.getElementById('btn-gestione-debitori');
    const btnGeneraEmail = document.getElementById('btn-genera-email');
    
    if (!btnGestioneDebitori || btnGestioneDebitori.style.display === 'none') return;

    const oggi = new Date();
    const ora = oggi.getHours();
    const minuti = oggi.getMinutes();
    const dataOggiStr = oggi.toDateString();

    const ultimoInvio = localStorage.getItem('ultimo_invio_email_debitori');

    if ((ora > 15 || (ora === 15 && minuti >= 30)) && ultimoInvio !== dataOggiStr) {
        btnGestioneDebitori.classList.add('allarme-moveout');
        btnGestioneDebitori.innerHTML = '🚨 GESTIONE DEBITORI (DA INVIARE!)';
        
        if (btnGeneraEmail) {
            btnGeneraEmail.classList.add('allarme-moveout');
            btnGeneraEmail.innerHTML = '⚠️ GENERA INVIO EMAIL (Scaduto)';
        }

        if (!localStorage.getItem('notifica_push_1530_inviata_' + dataOggiStr)) {
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("🚨 Easybox: Solleciti Debitori", {
                    body: "Sono passate le 15:30! Ricordati di generare e inviare i solleciti di pagamento.",
                    icon: "512.png",
                    vibrate: [200, 100, 200]
                });
                localStorage.setItem('notifica_push_1530_inviata_' + dataOggiStr, 'true');
            }
        }
    } else {
        btnGestioneDebitori.classList.remove('allarme-moveout');
        btnGestioneDebitori.innerHTML = '🚨 GESTIONE DEBITORI';
        
        if (btnGeneraEmail) {
            btnGeneraEmail.classList.remove('allarme-moveout');
            btnGeneraEmail.innerHTML = '📧 Genera Invio Email';
        }
    }
};

window.controllaAllarmeEmailDebitori();
setInterval(window.controllaAllarmeEmailDebitori, 60000);