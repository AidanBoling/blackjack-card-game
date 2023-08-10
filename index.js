import express from 'express';
import axios from 'axios';

const app = express();
const port = 3000;
const config = {
    baseURL: 'https://deckofcardsapi.com/api/deck/',
}

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index.ejs', { cardFill: 'empty' });
});




app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});