"""
main.py — FastAPI service untuk Smart Cafe Assistant Chatbot.

Menjalankan (dari folder yang sama dengan file ini):
    uvicorn main:app --reload --port 8001

PENTING SOAL PORT: pakai 8001, BUKAN 8000 -- port 8000 sudah dipakai oleh
Laravel (php artisan serve). ChatController.php memanggil port 8001 ini.

PENTING: model (MLP + FastText + data menu) di-load SATU KALI saat proses
uvicorn ini start -- bukan setiap ada chat masuk. Inilah alasan utama
migrasi dari shell_exec() ke FastAPI: menghilangkan overhead "cold start"
yang sebelumnya terjadi di setiap pesan.

File yang WAJIB ada di folder yang sama:
    chatbot_brain.pkl   (hasil export notebook v3 -- model MLP + intents)
    fasttext-id-mini    (model FastText terkompresi, dari Zenodo)
    food_2.csv
    Item_to_id_2.csv
"""
import json
import pickle
import re
import random

import numpy as np
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel
from compress_fasttext.models import CompressedFastTextKeyedVectors

# ======================================================================
# 1. LOAD SEMUA ARTEFAK -- HANYA SEKALI, SAAT SERVER START
# ======================================================================
print("[startup] Memuat chatbot_brain.pkl ...")
with open("chatbot_brain.pkl", "rb") as f:
    brain = pickle.load(f)          # dict, BUKAN tuple -- jangan di-unpack langsung!

model = brain["model"]
intents = brain["intents"]
fasttext_path = brain["fasttext_path"]
vector_dim = brain["vector_dim"]

print(f"[startup] Memuat model FastText dari '{fasttext_path}' ...")
ft = CompressedFastTextKeyedVectors.load(fasttext_path)

print("[startup] Memuat food_2.csv & Item_to_id_2.csv untuk fitur rekomendasi ...")
df_food = pd.read_csv("food_2.csv")
df_items = pd.read_csv("Item_to_id_2.csv")
df_food.columns = df_food.columns.str.strip()
df_items.columns = df_items.columns.str.strip()

# Pemetaan posisi (item_id) -- WAJIB sebelum dropna, sama seperti di notebook.
df_food["item_id"] = df_food.index + 1
df_food["kategori"] = (df_food["id"] // 1000).astype("Int64")
df_food = df_food.dropna(subset=["id", "times_appeared", "food_rating"]).copy()
for kol in ["id", "times_appeared", "food_rating"]:
    df_food[kol] = df_food[kol].astype(int)

print("[startup] Memuat menu_catalog.json untuk widget menu ...")
with open("menu_catalog.json", "r", encoding="utf-8") as f:
    menu_catalog = json.load(f)

# item_id di food_2.csv/Item_to_id_2.csv TIDAK 1:1 dengan menu_catalog.json --
# ada item lama (dari food_2.csv) yang belum/tidak dimasukkan ke menu widget
# order Laravel. Set ini dipakai _top3_kategori() supaya rekomendasi tidak
# pernah menyebut item yang tidak bisa dipesan lewat widget.
MENU_CATALOG_IDS = {item["id"] for item in menu_catalog}

print(f"[startup] Siap. {len(intents)} intent dimuat, embedding: {brain.get('embedding')}, dim: {vector_dim}, {len(menu_catalog)} item menu")

# ======================================================================
# 2. TEXT PROCESSING (identik dengan notebook, JANGAN sampai berbeda)
# ======================================================================
def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def kalimat_ke_vektor(kalimat: str) -> np.ndarray:
    """Vektor kalimat = rata-rata vektor kata. Subword FastText tetap
    memberi vektor bermakna untuk kata typo/OOV seperti 'expersso'."""
    kata_kata = kalimat.split()
    if not kata_kata:
        return np.zeros(vector_dim, dtype=np.float32)
    return np.mean([ft[k] for k in kata_kata], axis=0)


# ======================================================================
# 3. REKOMENDASI DINAMIS PER-KATEGORI (identik dengan notebook)
#    kategori: 1=non-kopi(shake/juice) 2&3=makanan(dessert/puff) 4=kopi
# ======================================================================
def _top3_kategori(daftar_kategori):
    sub = df_food[df_food["kategori"].isin(daftar_kategori)]

    # Buang kandidat yang TIDAK ADA di menu_catalog.json SEBELUM ranking --
    # supaya item orderable berikutnya naik gantiin slot yang di-exclude,
    # bukan cuma mengurangi hasil akhir jadi < 3 rekomendasi.
    tidak_orderable = sub[~sub["item_id"].isin(MENU_CATALOG_IDS)]
    if not tidak_orderable.empty:
        nama_map = df_items.set_index("id")["name"]
        for _, baris in tidak_orderable.iterrows():
            nama = nama_map.get(baris["item_id"], f"item_id={baris['item_id']}")
            nama = nama.strip() if isinstance(nama, str) else nama
            print(f"[rekomendasi] Exclude '{nama}' (item_id={baris['item_id']}, "
                  f"food_rating={baris['food_rating']}, times_appeared={baris['times_appeared']}) "
                  f"-- tidak ada di menu_catalog.json, tidak bisa dipesan lewat widget.")
    sub = sub[sub["item_id"].isin(MENU_CATALOG_IDS)]

    terbaik = sub[sub["food_rating"] == sub["food_rating"].max()] \
        .sort_values("times_appeared", ascending=False)
    if terbaik.empty:
        terbaik = sub.sort_values("times_appeared", ascending=False)
    ids = terbaik["item_id"].head(3).tolist()
    urut = {v: k for k, v in enumerate(ids)}
    nama = df_items[df_items["id"].isin(ids)].copy()
    nama["urut"] = nama["id"].map(urut)
    return nama.sort_values("urut")["name"].str.strip().tolist()


def rekomendasi_kopi() -> str:
    menu = _top3_kategori([4])
    return ("Kalau untuk kopi, jagoan terlaris kami: " + ", ".join(menu) +
            ". Diseduh dari house blend Arabika Gayo & Robusta Temanggung. "
            "Mau coba salah satunya, kak? ☕")


def rekomendasi_non_kopi() -> str:
    menu = _top3_kategori([1])
    return ("Untuk yang bebas kafein, paling favorit: " + ", ".join(menu) +
            ". Seger dan aman di lambung! Mau dipesankan, kak? 🥤")


def rekomendasi_makanan() -> str:
    menu = _top3_kategori([2, 3])
    return ("Cemilan pendamping ngopi terlaris kami: " + ", ".join(menu) +
            ". Dijamin nagih, kak! Mau langsung dipesan? 🥐")


MARKER_HANDLER = {
    "REKOMENDASI_KOPI": rekomendasi_kopi,
    "REKOMENDASI_NON_KOPI": rekomendasi_non_kopi,
    "REKOMENDASI_MAKANAN": rekomendasi_makanan,
}

# ======================================================================
# 4. LOGIKA PREDIKSI UTAMA (identik dengan predict_chat() di notebook)
# ======================================================================
def predict_chat(user_message: str, threshold: float = 0.35) -> dict:
    bersih = clean_text(user_message)
    vektor = kalimat_ke_vektor(bersih).reshape(1, -1)

    prob = model.predict_proba(vektor)[0]
    max_prob = float(prob.max())
    tag = model.classes_[prob.argmax()]

    if max_prob < threshold:
        return {
            "reply": "Maaf kak, aku belum paham maksudnya. Bisa infokan kembali "
                     "menu atau harga apa yang ingin kamu tanyakan? 😊",
            "intent": None,
            "confidence": round(max_prob, 4),
        }

    for intent in intents:
        if intent["tag"] == tag:
            respons = random.choice(intent["responses"])
            if respons in MARKER_HANDLER:          # marker -> jawaban dinamis Pandas
                respons = MARKER_HANDLER[respons]()
            return {"reply": respons, "intent": tag, "confidence": round(max_prob, 4)}

    return {"reply": "Maaf, terjadi kesalahan sistem.", "intent": tag, "confidence": round(max_prob, 4)}


# ======================================================================
# 5. FASTAPI APP & ENDPOINT
# ======================================================================
app = FastAPI(title="Smart Cafe Chatbot API")


class ChatInput(BaseModel):
    message: str


@app.get("/")
def health_check():
    """Cek cepat: server hidup & artefak berhasil dimuat. Buka di browser
    saat uvicorn sudah jalan untuk pastikan startup sukses sebelum tes chat."""
    return {
        "status": "ok",
        "total_intent": len(intents),
        "embedding": brain.get("embedding", "unknown"),
        "vector_dim": vector_dim,
    }


@app.post("/predict")
def predict(data: ChatInput):
    return predict_chat(data.message)


@app.get("/menu")
def get_menu():
    return {"items": menu_catalog}
