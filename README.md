# 🔄 OuroXchange (web-app-OX)

> **Know something. Have something. Need something.**  
> OuroXchange connects local community members to learn from one another, swap useful goods, and donate items they no longer need — directly, transparently, and 100% free of transaction fees.

---

## 🌟 Key Features

### 🔐 Authentication & Account Management
- **Email & Password Authentication**: Powered by Firebase Auth Modular v10.
- **Mandatory Email Verification**: Prominent post-signup banner prompting users to verify their email address before access.
- **Password Visibility Toggle**: Interactive show/hide password toggle (👁 / 🙈) on login and signup forms.
- **Profile Customization**: Users can configure their bio, city/area, skills they know, skills they need, and avatar photo.
- **Permanent Account Deletion**: Users can delete their account, automatically wiping their listings and profile data.

### 💬 Real-Time 1-to-1 Messaging
- **Firestore-Powered Persistence**: Conversations survive page refreshes and browser restarts.
- **Live Sync**: Uses Firestore `onSnapshot` for instant delivery of messages and photo attachments without polling.
- **Read Receipts**: Dynamic "Sent" vs "Seen" status receipts when the recipient views the message.
- **Recency-Sorted Sidebar**: Conversations are sorted by the latest activity timestamp.
- **Unread Counters & Nav Badges**: Live counters update in the top navigation bar and chat sidebar.
- **Dynamic Profile Hydration**: Conversation partners are automatically hydrated from Firestore even if they are not in the initial user cache.

### 📦 Item Listings & Exchange
- **Multi-Category Support**: Books, Electronics, Daily-use items, Sports equipment, and other permitted goods.
- **Exchange & Donate Modes**: Tag listings for swaps or free community donations.
- **Image Previews**: Upload item photos with preview tags and category-specific badges.
- **Lifecycle Management**: Mark items as Available, Exchanged, or Completed, or delete them when done.

### 📬 Interactive Contact Us Page
- **Contact Form**: Direct messaging form with category selection (Inquiry, Swap Support, Trust & Safety, Bug Report).
- **Firestore Storage**: Submissions are logged directly into the `contact_messages` collection.
- **Direct Support Channels**: Dedicated contact points for General, Safety, and Feedback.
- **Built-In FAQs**: Answers to common community questions regarding safety, fees, and swaps.

### 🛡️ Privacy Policy & Community Safety
- **Dedicated Privacy Policy Page**: Transparent 8-section breakdown covering data handling, cookies, user rights, and children's privacy.
- **Safety Reminders**: In-app banners urging exchanges in safe, public places and warning against advance payments.

### 🎨 Clean Google-Style Footer
- **Location & Status Bar**: Displays local network location and peer-to-peer status.
- **Split Navigation Bar**: Dual-aligned navigation grouping core features and legal policies.
- **Responsive Layout**: Adapts gracefully across mobile, tablet, and desktop screens.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, Modern CSS3 (CSS Variables, Flexbox, Grid), Modern Vanilla JavaScript (ES6+).
- **Backend-as-a-Service**: Firebase Modular SDK v10 (Authentication & Cloud Firestore).
- **Typography**: [Figtree](https://fonts.google.com/specimen/Figtree) & [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) via Google Fonts.
- **Hosting Options**: GitHub Pages, Firebase Hosting, Vercel, or any static file host.

---

## 📂 Project Structure

```text
web-app-OX/
├── index.html        # Main single-page application entry point
├── app.js            # Core application state, routing, and UI rendering logic
├── style.css         # Design system, themes, components, and responsive styles
├── firebase.js       # Firebase v10 Modular SDK initialization & bridge
├── .gitignore        # Git ignore rules for clean repository maintenance
├── LICENSE           # Open-source MIT License
└── README.md         # Comprehensive project documentation
```

---

## 🚀 Getting Started

### Prerequisites
All you need is a modern web browser and a static web server (such as Python, Node.js `serve`, or the VS Code Live Server extension).

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/web-app-OX.git
cd web-app-OX
```

### 2. Run Locally
You can run a local server using Python:

```bash
# Python 3
python -m http.server 5000
```

Or using Node.js:
```bash
# Using npx serve
npx serve .
```

Or simply right-click `index.html` in VS Code and select **Open with Live Server**.

Then open [http://localhost:5000](http://localhost:5000) in your browser.

---

## ⚙️ Firebase Configuration

The project is pre-configured with Firebase in `firebase.js`. If you wish to use your own Firebase project:

1. Create a project at the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** (Email/Password provider).
3. Enable **Cloud Firestore** in test mode or with appropriate security rules.
4. Replace the `firebaseConfig` object in [`firebase.js`](firebase.js) with your project credentials:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

