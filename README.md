PaperTradeX

A client-side paper trading simulator built with HTML, CSS, and JavaScript. No backend, no frameworks — everything runs in the browser.


What it does

Trade virtual stocks using simulated, real-time price updates
Track your portfolio value, cash balance, and profit/loss
View a live scrolling ticker tape for all stocks
See a price chart (sparkline) for the selected stock
Add stocks to a watchlist
View your full transaction history
Your data is saved in the browser using localStorage, so it stays after refreshing


How prices work

Prices are simulated, not real market data. Each stock's price updates every 2 seconds using a random walk, so prices move up and down realistically without needing an external API.


Tech used

HTML
CSS
JavaScript
Canvas API for the price chart
localStorage for saving data


How to run it

Download or clone the repository
Open index.html in any browser
That's it, no installation or setup needed


Files

index.html – page structure
style.css – styling
app.js – app logic (market simulation, trading, portfolio, storage)


Notes

Starting balance is $10,000 virtual cash
Use the Reset button to clear your portfolio and start over
This project is for practice and learning purposes only, not real trading
