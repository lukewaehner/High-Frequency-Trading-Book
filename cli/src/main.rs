use clap::{Parser, Subcommand};
use orderbook::Side;
use serde::{Deserialize, Serialize};

#[derive(Parser)]
#[command(name = "hftx-cli")]
#[command(about = "HFT Ledger CLI - Command line client for the exchange")]
struct Cli {
    #[arg(short, long, default_value = "http://localhost:8080")]
    server: String,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Submit {
        #[arg(short = 's', long)]
        symbol: String,
        #[arg(long, value_parser = parse_side)]
        side: Side,
        #[arg(short = 'p', long)]
        price: i64,
        #[arg(short = 'q', long)]
        quantity: i64,
    },
    Status {
        #[arg(short, long)]
        symbol: Option<String>,
    },
    Health,
    Symbols,
    Depth {
        #[arg(short, long)]
        symbol: String,
        #[arg(short, long, default_value = "10")]
        levels: usize,
    },
    Cancel {
        #[arg(short, long)]
        symbol: String,
        #[arg(short, long)]
        order_id: String,
    },
}

#[derive(Serialize)]
struct SubmitOrderRequest {
    side: Side,
    price: i64,
    quantity: i64,
}

#[derive(Deserialize)]
struct SubmitOrderResponse {
    order_id: u128,
    status: String,
    trades: Vec<Trade>,
}

#[derive(Deserialize)]
struct Trade {
    qty: i64,
    px_ticks: i64,
}

#[derive(Deserialize)]
struct SymbolsResponse {
    symbols: Vec<String>,
}

#[derive(Deserialize)]
struct OrderBookState {
    symbol: String,
    best_bid: Option<i64>,
    best_ask: Option<i64>,
    bid_levels: usize,
    ask_levels: usize,
}

#[derive(Deserialize)]
struct MarketDepth {
    symbol: String,
    bids: Vec<PriceLevel>,
    asks: Vec<PriceLevel>,
}

#[derive(Deserialize)]
struct PriceLevel {
    price: i64,
    quantity: i64,
    orders: usize,
}

fn parse_side(s: &str) -> Result<Side, String> {
    match s.to_lowercase().as_str() {
        "bid" | "buy" => Ok(Side::Bid),
        "ask" | "sell" => Ok(Side::Ask),
        _ => Err(format!("Invalid side: {}. Use 'bid' or 'ask'", s)),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let client = reqwest::Client::new();

    match cli.command {
        Commands::Submit { symbol, side, price, quantity } => {
            let request = SubmitOrderRequest { side, price, quantity };
            
            let response = client
                .post(&format!("{}/symbols/{}/orders", cli.server, symbol))
                .json(&request)
                .send()
                .await?;

            if response.status().is_success() {
                let result: SubmitOrderResponse = response.json().await?;
                
                println!("Order ID: {}", result.order_id);
                println!("Status: {}", result.status);
                
                if !result.trades.is_empty() {
                    println!("Trades executed: {}", result.trades.len());
                    for trade in result.trades {
                        println!("  {} shares @ {} ticks", trade.qty, trade.px_ticks);
                    }
                }
            } else {
                println!("Error: {}", response.status());
                println!("{}", response.text().await?);
            }
        }
        
        Commands::Status { symbol } => {
            match symbol {
                Some(sym) => {
                    let response = client
                        .get(&format!("{}/symbols/{}/orderbook", cli.server, sym))
                        .send()
                        .await?;

                    if response.status().is_success() {
                        let state: OrderBookState = response.json().await?;
                        println!("Symbol: {}", state.symbol);
                        println!("Best Bid: {:?}", state.best_bid);
                        println!("Best Ask: {:?}", state.best_ask);
                        println!("Bid Levels: {}", state.bid_levels);
                        println!("Ask Levels: {}", state.ask_levels);
                    } else {
                        println!("Error: {}", response.status());
                    }
                }
                None => {
                    let response = client
                        .get(&format!("{}/symbols", cli.server))
                        .send()
                        .await?;

                    if response.status().is_success() {
                        let symbols: SymbolsResponse = response.json().await?;
                        println!("Active symbols:");
                        for symbol in symbols.symbols {
                            let state_response = client
                                .get(&format!("{}/symbols/{}/orderbook", cli.server, symbol))
                                .send()
                                .await?;
                            
                            if state_response.status().is_success() {
                                let state: OrderBookState = state_response.json().await?;
                                println!("  {}: bid={:?}, ask={:?}", 
                                         symbol, state.best_bid, state.best_ask);
                            }
                        }
                    } else {
                        println!("Error: {}", response.status());
                    }
                }
            }
        }
        
        Commands::Health => {
            let response = client
                .get(&format!("{}/health", cli.server))
                .send()
                .await?;

            if response.status().is_success() {
                let health: serde_json::Value = response.json().await?;
                println!("{}", serde_json::to_string_pretty(&health)?);
            } else {
                println!("Error: {}", response.status());
            }
        }
        
        Commands::Symbols => {
            let response = client
                .get(&format!("{}/symbols", cli.server))
                .send()
                .await?;

            if response.status().is_success() {
                let symbols: SymbolsResponse = response.json().await?;
                for symbol in symbols.symbols {
                    println!("{}", symbol);
                }
            } else {
                println!("Error: {}", response.status());
            }
        }
        
        Commands::Depth { symbol, levels } => {
            let response = client
                .get(&format!("{}/symbols/{}/depth?levels={}", cli.server, symbol, levels))
                .send()
                .await?;

            if response.status().is_success() {
                let depth: MarketDepth = response.json().await?;
                
                println!("Market Depth for {}", depth.symbol);
                println!("\nAsks:");
                for (i, level) in depth.asks.iter().enumerate() {
                    println!("  {}: {} @ {} ({} orders)", i + 1, level.quantity, level.price, level.orders);
                }
                
                println!("\nBids:");
                for (i, level) in depth.bids.iter().enumerate() {
                    println!("  {}: {} @ {} ({} orders)", i + 1, level.quantity, level.price, level.orders);
                }
            } else {
                println!("Error: {}", response.status());
            }
        }
        
        Commands::Cancel { symbol, order_id } => {
            let response = client
                .delete(&format!("{}/symbols/{}/orders/{}", cli.server, symbol, order_id))
                .send()
                .await?;

            if response.status().is_success() {
                let result: serde_json::Value = response.json().await?;
                println!("{}", serde_json::to_string_pretty(&result)?);
            } else {
                println!("Error: {}", response.status());
                println!("{}", response.text().await?);
            }
        }
    }

    Ok(())
}
