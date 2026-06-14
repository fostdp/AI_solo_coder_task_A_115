mod api;
mod ballistics;
mod siege;
mod storage;
mod udp_server;

use api::{AppState, create_router};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    env_logger::init();

    let db = Arc::new(storage::Database::new());

    if let Err(e) = db.load_trebuchets().await {
        eprintln!("Failed to load trebuchets: {}", e);
    }

    if let Err(e) = db.load_wall_types().await {
        eprintln!("Failed to load wall types: {}", e);
    }

    let latest_results = Arc::new(Mutex::new(
        HashMap::<u32, ballistics::BallisticResult>::new(),
    ));
    let latest_siege = Arc::new(Mutex::new(
        HashMap::<u32, siege::SiegeAssessment>::new(),
    ));

    let udp_addr = "0.0.0.0:9001";
    let http_addr = "0.0.0.0:8080";

    let db_clone = db.clone();
    let results_clone = latest_results.clone();
    let siege_clone = latest_siege.clone();

    tokio::spawn(async move {
        if let Err(e) =
            udp_server::run_udp_server(udp_addr, db_clone, results_clone, siege_clone).await
        {
            eprintln!("UDP server error: {}", e);
        }
    });

    let state = AppState {
        db: db.clone(),
        latest_results: latest_results.clone(),
        latest_siege: latest_siege.clone(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = create_router(state).layer(cors);

    let listener = tokio::net::TcpListener::bind(http_addr).await.unwrap();
    println!("HTTP server listening on http://{}", http_addr);
    println!("UDP server listening on udp://{}", udp_addr);

    axum::serve(listener, app).await.unwrap();
}
