import express from 'express';
import axios from 'axios';

const app = express();
const port = 3000;
const config = { baseURL: 'https://deckofcardsapi.com/api/deck/', }

// let deckID = 'gkxwgixyhm9j';
let deckID = '';
let round = 0;
let roundActive = false;
let showAll = false;
let modalMessage = '';

class Participant {
    constructor(who) {
        this.who = who;
        this.cards = [];
        this.cardValues = [];
        this.cardsOnTable = 0;
        this.points = 0;
        this.stay = false;
        this.wins = 0;
    }

    get cardNum() { return this.cards.length } // May not be necessary
    
    get undealt() {
        let undealtCards = [];
        this.cards.forEach(card => {
            if (!card.dealt) { undealtCards.push(card); }
        });

        return undealtCards;
    } 

    get dealt() {
        let dealtCards = [];
        this.cards.forEach(card => {
            if (card.dealt) { dealtCards.push(card); }
        });

        return dealtCards;
    } 

    get resetPoints() { this.points = 0 }

    addToHand(card) {

        const code = card.code;
        const value = card.value;
        const suit = card.suit;
        const image = card.images.png;
        const order = this.cardNum + 1; // May not be necessary
        let show = 'up';

        // Set dealer's first card (only) to display face-down
        if (this.cards.length === 0 && this.who === 'dealer') { show = 'down'; }

        const newCard = new Card(code, value, suit, image, order, show);
        // console.log(newCard);

        // Add to card list
        this.cards.push(newCard);

        this.cardValues.push(value); 
        // console.log(`Card values list: \n${this.cardValue}`)
    }

    checkTotal(res) {
        const newTotal = this.calcHandTotal();
        if (newTotal > 21) { endRound(res); }

        return newTotal
    }

    // Re-calculate entire total every time b/c aces can be high or low, depending on rest of total

    calcHandTotal() {

        let total = 0;
        let acesNum = 0;
        this.cardValues.forEach(value => { 
            if (value !== 'ACE') { 
                if (value === 'KING' || value === 'QUEEN' || value === 'JACK') { total += 10; }
                else { total += Number(value) }
            } else { acesNum += 1 }
        }); 

        if ( acesNum > 0 ) { 
            let acesHigh = 10 + acesNum;
            if (total <= 21 - acesHigh ) { total += acesHigh } 
            else { total += acesNum }; 
        }

        this.points = total;

        return total
    }    
}

function Card(code, value, suit, image, order, show) {
    this.code = code;
    this.value = value;
    this.suit = suit;
    this.image = image;
    this.order = order;
    this.show = show;
    this.dealt = false;
}

class ModalMessage {
    constructor(title, text, formRoute, actions, closeBtnText = 'Cancel', messageCode = '') {
        this.title = title;
        this.text = text;
        this.formRoute = formRoute;
        this.actions = actions;
        this.closeBtnText = closeBtnText;
        this.messageCode = messageCode;
    }
}

const dealer = new Participant('dealer');
const player = new Participant('player');
const participants = [dealer, player]

let whosTurn = player.who;


app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));


// ROUTING

app.get('/', (req, res) => {
    console.log('(Re)loading webpage.');

    let participantList = participants;

    if (deckID === '' || player.cards.length===0 || dealer.cards.length===0) {
        participantList = '',
        console.log(`Game reset. Round: ${round}`)
    } 
    
    // Some verbose logging:
    else { 
        console.log(`round: ${round}\n`);
        participantList.forEach(p => { 
            console.log(`${p.who}:\n - points: ${p.points}\n - stay: ${p.stay}\n - wins: ${p.wins}\n`)
        }); 

        if (modalMessage !== '') { 
            console.log(`message: ${modalMessage.title}`);
        }
    }

    let ejsData = {
        participants: participantList,
        cardBack: 'https://deckofcardsapi.com/static/img/back.png',
        currentRound: round,
        message: modalMessage,
        showAllCards: showAll,
        roundIsActive: roundActive,
        turn: whosTurn,
    }

    res.render('index.ejs', ejsData);

    player.cards.forEach(card => { card.dealt = true });
    dealer.cards.forEach(card => { card.dealt = true });

    // Q: Can maybe do modalMessage clear here, only, instead of multiple other places?
});


// Start new game -- get new decks + shuffle

app.post('/new', async (req, res) => {
    modalMessage = ''; // Clear any messages

    if (req.body.start === 'new') { clearStats(); }
    if (req.body.start === 'continue') { 
        // To-do (LATER): if already deck ID/game in progress, show confirmation dialog
    }

    // If already have a deck, clear and shuffle deck instead of getting new deck:
    roundPreCheck(res);
});

app.post('/player-move', (req, res) => {
    modalMessage = ''; // Clear any messages

    if (whosTurn === 'player') { 
        console.log('Player\'s move request received');

        if (req.body.move === 'hit') {
            console.log('Player is going to hit.');
            hit(res);

        } else if (req.body.move === 'stay') {
            console.log('Player is going to stay.');
            stay(player, res);
        }

    } else { 
        console.log(`Not player's turn (or something else went wrong) -- no action taken.\nCurrently it's ${whosTurn}'s turn.`);
        res.redirect('/'); }
});

app.post('/modal', (req, res) => {
    modalMessage = ''; // Clear any messages

    if (req.body.modal === 'continue' || req.body.modal === 'confirm') { 
        // Start new round
        roundPreCheck(res);
        // startNewRound(res);
    } else {
        // If button option not "continue", re-load page.
        res.redirect('/');
    }

});



// DECK SETUP & CHECK

async function roundPreCheck(response) {
    //Check if a deck already exists. If so, shuffle deck
    console.log('Precheck')
    if (deckID) { 
        console.log(`Existing deck ID: ${deckID}`);
        startNewRound(response);

    } else {
        const deck = await getNewDeck(response);

        if (deck) { initialDeal(response); }
        else { res.redirect('/'); }
    }    
}


async function getNewDeck(res) {
    try {
        const endpoint = 'new/shuffle/?deck_count=6';
        const response = await axios.get(endpoint, config);
        
        deckID = response.data.deck_id
        console.log(`Deck ID: ${response.data.deck_id}`);

        return response.data.shuffled;

    } catch (error) {
        console.error("Request failed: ", error.message);
        errorMessage(['Unable to get new deck.', `(Error code: ${error.response.status})`, 'Try waiting a moment, then refresh the page and try again.'])
    }
}


// GAMEPLAY

async function initialDeal(res) {
    round += 1;
    roundActive = true;

    try {
        const cards = await drawCards(4);

        // Deal each card, alternating player then dealer
        player.addToHand(cards[0])
        dealer.addToHand(cards[1])
        player.addToHand(cards[2])
        dealer.addToHand(cards[3])  
        
        // Check (& set) point totals
        player.checkTotal();
        dealer.checkTotal();
        
    } catch (error) { console.error("Initial deal failed:", error.message); 
    } finally { res.redirect('/'); } // Update app
    
}


async function drawCards(num) {
    try {
        const endpoint = deckID + `/draw/?count=${num}`;
        const response = await axios.get(endpoint, config);
        const cards = response.data["cards"];

        console.log(`Cards drawn: \n`);
        console.log(cards);
        
        return cards;

    } catch (error) { 
        console.error("Draw cards request failed: ", error.message);
        errorMessage(['Something went wrong -- Unable to draw cards']);
    }
}


function toggleWhosTurn(res) {
    console.log(`It was: ${whosTurn}'s turn`) 

    if (whosTurn === 'player') { 
        // Toggle to dealer's turn and start dealer move
        whosTurn = dealer.who;
        console.log(`Now it's: ${whosTurn}'s turn`);
        dealerMove(res);
    } else { 
        // Toggle to player's turn, and re-render the page to deal cards
        whosTurn = player.who; 
        console.log(`Now it's: ${whosTurn}'s turn`);
        res.redirect('/');
    }
}


function dealerMove(res) {

    console.log('The dealer is moving.');

    if (dealer.points < 17) { 
        console.log('The dealer is going to hit');
        hit(res); 
    } 
    else { 
        console.log('Dealer is going to stay');
        stay(dealer, res);  
    }
}


async function hit(response) {
    console.log(`${whosTurn} is hitting.`);

    const cards = await drawCards(1);
    
    if (whosTurn === 'player') { 
        player.addToHand(cards[0]);
        if (player.checkTotal(response) <= 21) {
            if (!dealer.stay) { toggleWhosTurn(response); }
            else { response.redirect('/'); }
        }
    } else { 
        dealer.addToHand(cards[0]); 
        if (dealer.checkTotal(response) <= 21) {
            if (!player.stay) { toggleWhosTurn(response); }
            else { dealerMove(response); } 
        }
    }
}


function stay(hand, response) {
    console.log(`${whosTurn} is staying.`);

    hand.stay = true;

    if (player.stay && dealer.stay) { endRound(response); }
    else { toggleWhosTurn(response); }
}


function endRound(res) {
    console.log(`Round over. \n\nDealer: ${dealer.points} \nPlayer: ${player.points}\n`)
    
    let winner = '';
    let reason = '';

    // Compare totals, declare winner, modify the end-of-round modal's message accordingly
    if (dealer.points <= 21 && player.points <= 21) { 
        if (dealer.points >= player.points) { winner = 'dealer'; } 
        else if (dealer.points < player.points ) { winner = 'player'; } 
        reason = 'closest';
    } else if (dealer.points > 21 && player.points <= 21) {
        winner = 'player'; 
        reason = 'Dealer busts';
        console.log('Dealer busts');
    } else {
        winner = 'dealer'; 
        reason = 'Player busts!';
        console.log('Player busts');
    }

    console.log(`Winner => ${winner} (${reason})\n`);

    if (winner === 'player') { player.wins += 1 }
    else { dealer.wins += 1 }

    // Set the end-of-round message (to be sent when page re-rendered)
    modalMessage = declareWinner(winner, reason);
    
    showAll = true;
    roundActive = false;

    // Re-render the page, to show the cards and then the end-of-round modal.
    res.redirect('/');
}


// START/END ROUNDS

async function startNewRound(response) {
    
    const cleared = resetCards(); // Clear the cards and cardValue lists (keep stats)
    
    // modalMessage = ''; // Clear message, so doesn't appear when page re-rendered

    try {
        if (cleared) {
            const shuffled = await shuffleDeck();
            if (shuffled) { initialDeal(response); };
        } 
    } catch { console.log('Failed to start new round');
        // Also add errorMessage and res.redirect here??
    }

    // Question -- can this be re-worked better using "Promise.all", or something?
}


async function shuffleDeck(res) {
    try {
        const endpoint = deckID + '/shuffle';
        const response = await axios.get(endpoint, config);
        
        console.log(`Deck shuffled: ${response.data.shuffled}`);

        return response.data.shuffled;

    } catch (error) {
        console.error("Shuffling deck failed: ", error.message);
        
        errorMessage(['Something when wrong with shuffling the deck.', `(Error code: ${error.response.status})`, 'Try waiting a moment, then refresh the page and click "New Game".'])
        
        res.redirect('/');
    }
}


function clearStats() {

    round = 0; 
    player.wins = 0; 
    dealer.wins = 0;

    if (player.wins === 0) { return true; } 
    else { return false; }
}
  

function resetCards() {
    whosTurn = player.who;

    // while (player.points !== 0 && dealer.points !== 0)
    showAll = false;

    participants.forEach(p => {
        p.cards = [];
        p.cardValues = [];
        p.resetPoints;
        p.stay = false;
    });

    console.log(`Player points: ${player.points}, Dealer points: ${dealer.points}`)
    
    if (player.points === 0 && dealer.points === 0) {
        return true;
    } else { 
        return false;
    }
}

// MESSAGES:

function declareWinner(winner, reason) {
    console.log('Setting up declare-winner message');

    let title = 'Round Over';

    let formRoute = '/modal';
    let actions = [{
            value: 'confirm', 
            text: "Deal 'em!", 
            label: 'button to confirm',
        }];
    let closeBtn = 'Nope';
    let messageCode = 'endRound';
    
    let subheader = '';
    let pointsDealer = `Dealer: ${dealer.points}`; 
    let pointsPlayer = `Player: ${player.points}`;

    // console.log(`Winner => ${winner} (${reason})\n`)

    if (winner === 'dealer') { title = 'House Wins'; }
    else if (winner === 'player') { title = 'Player Wins!'; }
        
    if (reason !== 'closest') {
        // console.log('Following route for "other" reason -- added subheader');
        subheader = reason;
    } else { 
        // console.log('Following route for "closest" reason - no changes to defaults');
    }

    const messageContent = {
        subheading: subheader,
        normal: [`Dealer: ${dealer.points}`, `Player: ${player.points}`],
        emphasized: ['Continue playing?'],
    };
    
    // console.log(`Message title: ${title}\nMessage content: \n${messageContent.normal}`);

    return new ModalMessage(title, messageContent, formRoute, actions, closeBtn, messageCode);

}

function errorMessage(message) {
    let title = "Hmmm... That didn't work";
    let text = {
        normal: message,
        emphasized: '', 
    };
    let formRoute = '/modal';
    let actions = '';
    let closeBtn = 'Close';
    let code = 'immediate';

    modalMessage = new ModalMessage(title, text, formRoute, actions, closeBtn, code);
}

function welcomeMessage(message) {
    let title = '♡♧ Blackjack ♤♢';
    let text = {
        normal: ['Hi there!', 'Welcome to my card game app.'],
        emphasized: ['Start a new game?']};
    let formRoute = '/modal';
    let actions = [{
            value: 'confirm', 
            text: "Why not?", 
            label: 'confirm button'
        }];
    let closeBtn = 'Nah';
    let code = 'immediate';

    modalMessage = new ModalMessage(title, text, formRoute, actions, closeBtn, code);
}


welcomeMessage();


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});