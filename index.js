import express from 'express';
import axios from 'axios';

const app = express();
const port = 3000;
const config = { baseURL: 'https://deckofcardsapi.com/api/deck/', }

let deckID = 'gkxwgixyhm9j';
let round = 0;
let gamesPlayed = 0;
let message = '';


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
        // console.log('Card values list: \n')
        // console.log(this.cardValues);
    }

    checkTotal(res) {


        const newTotal = this.calcHandTotal();
        if (newTotal > 21) {
            endRound(res);
        }

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

    // this.player = player;
    this.order = order;
    this.show = show;
    this.dealt = false;
}

function Message(title, message, formRoute, actions, closeBtnText='Cancel', messageCode='') {
    this.title = title;
    this.text = message;
    this.formRoute = formRoute;
    this.actions = actions; 
    this.closeBtnText = closeBtnText; 
    this.messageCode = messageCode;
}

const dealer = new Participant('dealer');
const player = new Participant('player');
const participants = [dealer, player]
let whosTurn = player.who;


app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    console.log('(Re)loading webpage.');
    
    let ejs = {
        participants: participants,
        cardBack: 'https://deckofcardsapi.com/static/img/back.png',
        currentRound: round,
        message: message,
    }

    if (!deckID || player.cards.length===0 || dealer.cards.length===0) {
        ejs = {
            participants: '',
            cardBack: 'https://deckofcardsapi.com/static/img/back.png',
            currentRound: round,
        };
        console.log(`Game reset. Round: ${round}`)

    } else { 
        // Some verbose logging...
        console.log(`round: ${round}\n`);
        ejs.participants.forEach(p => { 
            console.log(`${p.who}:\n - points: ${p.points}\n - stay: ${p.stay}\n - wins: ${p.wins}\n`)
        }); 

        if (message !== '') { console.log(`message: ${ejs.message.title}`) }
    }

    res.render('index.ejs', ejs);

    player.cards.forEach(card => { card.dealt = true });
    dealer.cards.forEach(card => { card.dealt = true });
});


// Start new game -- get new decks + shuffle

app.post('/new', async (req, res) => {
    
    if (req.body.start === 'new') {
        clearStats(); }
    if (req.body.start === 'continue') {
        // LATER: if already deck ID/game in progress, show confirmation dialog
    }

    // If already have a deck, clear and shuffle deck instead of getting new deck
    if (deckID) { startNewRound(res); }
    else {
        const deck = await getNewDeck();
        if (deck) { initialDeal(res); }
    }    

    // try {
    // } catch (error) {
    //     console.error("Failed to make request:", error.message);
    //     // res.status(500) ...???

    //     //TODO: create error dialog on ejs -- and set... if (locals.error) { <<dialog html>> }
    //     //TODO: set error message to display:
    //     // res.render("index.ejs", { error: "Whoops! Something went wrong. Click button to refresh to try again." });
    //     res.redirect('/');

    // } 
    // finally { 
    //     if (player.cards.length === 0) { initialDeal(res); } 
        // else { res.redirect('/'); }
    // }
});

async function getNewDeck() {
    try {
        const endpoint = 'new/shuffle/?deck_count=6';
        const response = await axios.get(endpoint, config);
        const deckID = response.data.deck_id;
        console.log(`Deck ID: ${deckID}`);

        return response.data.shuffled

    } catch (error) {
        console.error("Failed to make request:", error.message);
        // res.status(500) ...???

        //TODO: create error dialog on ejs -- and set... if (locals.error) { <<dialog html>> }
        //TODO: set error message to display:
        // res.render("index.ejs", { error: "Whoops! Something went wrong. Click button to refresh to try again." });
        res.redirect('/');
    }
}

// new Promise.all(myinsts.map(Organization.getOrgById)).then(res.json).catch(res.status(500).json)

app.post('/player-move', (req, res) => {
    if (whosTurn === 'player') { 
        console.log('Player\'s move request received');

        if (req.body.move === 'hit') {
            console.log('Player is going to hit.');
            hit(res);
        } else if (req.body.move === 'stay') {
            console.log('Player is going to stay.');
            stay(player, res);
        }

    } else { res.redirect('/'); }
});

// app.post('/hit', async (req, res) => {
//     if (whosTurn === 'player') { console.log('Player is going to hit.');
//     hit(res);
//     }
//         // const card = drawCards(1);
//         // player.addToHand(card);
//         // player.checkTotal();
//         // toggleWhosTurn();
//     else { res.redirect('/'); }
// });

// app.post('/stay', async (req, res) => {
//     if (whosTurn === 'player') { console.log('Player is going to stay.');
//         stay(player, res); } 
//     else { res.redirect('/'); }
// });


app.post('/modal', (req, res) => {
    if (req.body === 'continue') { 
        // shuffle();
        // clear();
        // initialDeal();
    }
});

async function initialDeal(res) {
    round = 1;
    const cards = await drawCards(4);

    // "Deals" each card, alternating player then dealer

    player.addToHand(cards[0])
    
    dealer.addToHand(cards[1])

    player.addToHand(cards[2])

    dealer.addToHand(cards[3])  
    
    player.checkTotal();
    dealer.checkTotal();
    
    // Update app display
    res.redirect('/');
    
    // testDealResults();
}


async function drawCards(num) {
    try {
        const endpoint = `${deckID}/draw/?count=${num}`;
        const response = await axios.get(endpoint, config);
        const cards = response.data["cards"];

        console.log(`Cards drawn: \n`);
        console.log(cards);
        
        return cards;
    } catch (error) { console.error("Failed to make request:", error.message); }
}

function toggleWhosTurn(res) {
    console.log(`It was: ${whosTurn}'s turn`) 

    if (whosTurn === 'player') { 
        // toggle to dealer's turn and start dealer move
        whosTurn = dealer.who;
        console.log(`Now it's: ${whosTurn}'s turn`);
        dealerMove(res);
    } else { 
        // toggle to player's turn, and re-render the page to deal cards
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
    };
}


// Maybe assign values for each button for Hit and Stay (in one form),
// then pass value: move('player', val);

// function move(person, choice) {

//     // if choice="hit", card=drawCards(1), dealCard(person), calculateTotal(), toggleNextMove();
//     // else if choice="stay", 
// }


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
    
// [-] ToDo: dealer move calcs

function endRound(res) {
    console.log(`Round over. \n\nDealer: ${dealer.points} \nPlayer: ${player.points}\n`)
    
    let winner = '';
    let reason = '';

    // Advance round count
    round += 1;

    // Compare totals, declare winner, modify the end-of-round modal's message accordingly
    if (dealer.points <= 21 && player.points <= 21) { 
        if (dealer.points >= player.points) { winner = 'dealer'; } 
        else if (dealer.points < player.points ) { winner = 'player'; } 
        reason = 'closest'
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

    if (winner = 'player') { player.wins += 1 }

    // Create and store the end-of-round message (to be sent when page re-rendered)
    // declareWinner(winner);

    // Re-render the page, to show the cards and then the end-of-round modal.
    res.redirect('/');

    // [-] TODO: Add confirmation dialog to ask play again? 
        // Ask user if continue. if yes, shuffle & clear, then initial draw.
        // If no, close modal, res.redirect('/')   ???

    // [x]TODO: add win to appropriate participant

}

// Ask user if continue. if yes, shuffle & clear, then initial draw.

async function startNewRound(response) {

    // Clear the cards and cardValue lists (keep stats)
    const cleared = clearCards();
    
    // Clear any message, so doesn't appear when page re-rendered
    message = '';

    if (cleared) {
        const shuffled = await shuffleDeck();
        // if (shuffled) {
        initialDeal(response);
        // }
    } 

    // Note -- can this be re-worked better using "Promise.all", or something?
}


async function shuffleDeck() {
    try {
        const endpoint = `${deckID}/shuffle`;
        const response = await axios.get(endpoint, config);
        
        console.log(`Deck shuffled: ${response.data.shuffled}`)

        return response.data.shuffled

    } catch (error) {
        console.error("Failed to make request:", error.message);
        // res.status(500) ...???

        //TODO: create error dialog on ejs -- and set... if (locals.error) { <<dialog html>> }
        //TODO: set error message to display:
        // res.render("index.ejs", { error: "Whoops! Something went wrong. Please refresh to try again." });
    }

}


function clearStats() {

    gamesPlayed = 0; 
    round = 0; 
    player.wins = 0; 

    if (player.wins === 0) { return true; } 
    else { return false; }
}
  

function clearCards() {

    // while (player.points !== 0 && dealer.points !== 0)

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

// Deprecated -- remove later:

// function clear(stats=false, cards=true) {
//     if (stats) { 
//         gamesPlayed = 0; 
//         round = 0; 
//         player.wins = 0; 
//     }

//     // while (player.points !== 0 && dealer.points !== 0)
//     if (cards) {
//         participants.forEach(p => {
//             p.cards = [];
//             p.cardValues = [];
//             p.resetPoints;
//             p.stay = false;
//         });

//         console.log(`Player points: ${player.points}, Dealer points: ${dealer.points}`)
//         if (player.points === 0 && dealer.points === 0) {
//             return true;
//         } else { 
//             return false;
//         }
//     }
// }


// separateAces() {
    //     let subtotal = 0;
    //     let acesNum = 0;
    //     values.forEach(value => { 
    //         if (value !== 'A') { 
    //             if (value === 'KING' || value === 'QUEEN' || value === 'JACK') { subtotal += 10; }
    //             else { subtotal += Number(value) }
    //         } else { acesNum += 1 }
    //     }); 
    //     return { 'aces': acesNum, 'subtotal': subtotal }
    // }

        // const values = this.separateAces();
    // let newTotal = 0;

    // if ( values.aces > 0 ) { 
    //     let acesHigh = 10 + values.aces;
    //     if (values.nonAces <= 21 - acesHigh ) { newTotal += aceTotal } 
    //     else { newTotal += subTotals.aces }; 
    // } else { 
    //     newTotal = subTotals.subtotal
    // }

function declareWinner(winner, reason) {
    let title = 'Round Over';
    let messageLine = '';
    let formRoute = '/modal';
    let actions = [{
            value: 'confirm', 
            text: 'Yes', 
            label: 'confirmation button'
        }];
    let closeBtn = 'No';
    let messageCode = 'roundOver';

    if (reason === closest) {
        if (winner === 'dealer') { title = 'House Wins'; }
        else if (winner === 'player') { title = 'Player Wins!'; }
        messageLine = `Dealer: ${dealer.points} \nPlayer: ${player.points}`
    } else { messageLine = reason; }

    // message = new Message('roundOver', 'Round over', text, [messageLine, 'Continue playing?']); 
    message = new Message(title, message, formRoute, actions, closeBtn, messageCode);

}

// function testMessage() {
//     let title = 'Test Message!';
//     let message = ['This is a test of the emergency broadcast system']
//     let formRoute = '/modal';
//     let actions = [{
//             value: 'confirm', 
//             text: 'Ok', 
//             label: 'confirm button'
//         }];
//     let closeBtn = 'Cancel';

//     // message = new Message('test', 'Test Message!', 'This is a test of the emergency broadcast system', false, [{value: 'confirm', text: 'Ok', label: 'confirm button'}]);
//     message = new Message(title, message, formRoute, actions, closeBtn);
// }


// testMessage();


// function testDealResults() {
//     // console.log(`All player cards: \n`);
//     // console.log(player.cards);
//     // console.log(`All dealer cards: \n`)
//     // console.log(dealer.cards);
    
//     console.log(`All player UNdealt cards: \n`)
//     console.log(player.undealt);
//     console.log(`All dealer UNdealt cards: \n`)
//     console.log(dealer.undealt);

//     const pTotal = player.checkTotal();
//     const dTotal = dealer.checkTotal();

//     console.log(`Player: ${pTotal}, Dealer: ${dTotal}`);
// }


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// TODO Set dealer card to show faceup when round ends

// TODO: Grey out/disable other buttons (or something) if no deck id.

// TODO: Clean up error messages



// [x] TODO...Send card images to ejs... maybe even figure out how to send
//images as like svg code or something, so that it's harder for ppl to cheat
// (say, if they know their way around google chrome Dev Tools)

//[x]TODO: Set dealer card #d1 to be facedown...
// [x] ToDo: clear stats, empty card counts, shuffledeck, etc.) 

// [X] TODO: After cards rendered, set card.dealt = true for all cards in each hand 
// [ X ] ToDo: general card calcs once card assigned