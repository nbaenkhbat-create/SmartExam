# SmartEXAM — Аюулгүй байдлын тохиргоо

## Юу сайжирсан бэ

1. **Firebase Auth** — багш email/нууц үгээр нэвтэрнэ (зөвхөн нэр биш)
2. **RTDB Rules** — өрөө зөвхөн `ownerUid` эзэмшигч засана; хариултын түлхүүр сурагчид уншигдахгүй
3. **Хариулт тусгаарлалт** — `versions` = асуулт (хариултгүй), `answerKeys` = зөвхөн багш
4. **Cloud Function grading** — сервер дээр дүн бодно (`gradeSubmission`)
5. **Багшийн дахин дүгнэлт** — хуурамч оноог `answerKeys`-ээр засварлана
6. **CSP + secure UID** — XSS/guessable ID-ийн эсрэг

## Deploy хийх (заавал)

```bash
cd GIT
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use cuee-93e28

# 1) Auth: Console → Authentication → Sign-in method → Email/Password + Anonymous идэвхжүүл
#    (эсвэл: firebase deploy --only auth)

# 2) Rules
npx -y firebase-tools@latest deploy --only database

# 3) Cloud Functions (сервер дүн)
cd functions && npm install && cd ..
npx -y firebase-tools@latest deploy --only functions
```

**Анхаар:** Rules deploy хийхээс өмнө багш нэвтэрсэн байх ёстой — хуучин нээлттэй өрөөнүүд `ownerUid`гүй бол уншигдахгүй/засагдахгүй болно.

## Local тест

`index.html`-ийг шууд нээхэд Auth ажиллана (Firebase CDN). Functions локалд:

```bash
npx firebase-tools emulators:start --only functions,database
```
