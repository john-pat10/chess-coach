// "Punish the mistake" lessons: per-opening natural-looking moves that are
// actually errors, and exactly how to exploit them.
//
// Every line here was checked with Stockfish 19 (full NNUE build): the
// opponent's move really loses ground against best play, every move YOU are
// asked to find is the engine's top choice (or within a few hundredths of a
// pawn of it), and the final position is a clear advantage. `alts` lists
// other moves at a given ply (0 = first move after the mistake) that the
// engine rates just as highly, so the drill accepts them too.
//
// Types:
//   "move"   -- the opponent plays `mistake` after `setup`; you find `punish`.
//   "decide" -- a position from `fen`: is the sacrifice sound? If yes, you
//               then play the attack (`punish`); if no, `better` is the plan.
//
// `notes` explain an opponent reply in the line that is itself not best (the
// drill plays the tempting move, since that's what people actually do).

export const PATTERN_CHECKLISTS = {
  greekGift: [
    "Your light-squared bishop hits h7 (from d3, c2 or b1) and only the king defends h7.",
    "A knight can jump to g5 with check, and Black can't just take it (no bishop on e7, or you can recapture with a pawn on h4 / bishop on c1 and keep attacking).",
    "Once the knight leaves f3, your queen reaches h5 (or the h-file) in one move.",
    "No Black knight on f6 guarding h7 -- a pawn on e5 is what usually keeps it away.",
    "Black has no quick defender to bring over (...Nf6, ...Bf5, ...Re8 and ...Kf8).",
  ],
};

export const LESSONS = [
  // ------------------------------------------------------------ Italian Game
  {
    id: "fried-liver",
    type: "move",
    family: "Italian Game",
    opening: "Two Knights Defense",
    side: "white",
    title: "5...Nxd5? -- the Fried Liver",
    setup: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5",
    mistake: "Nxd5",
    why: "Taking back the pawn is the most natural move there is, and the d5 knight looks well placed.",
    punish: "6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3",
    explain:
      "With Black's knight on d5, f7 is guarded only by the king. 6.Nxf7! drags the king out. After 7.Qf3+ the king has to go to e6 to keep defending the d5 knight, and 8.Nc3 piles a third attacker onto it. The knight is pinned, the king is stuck in the middle, and White follows up with d4 and O-O. Black's correct 5th move was 5...Na5.",
    takeaway:
      "When the defender recaptures in the centre and leaves f7 guarded only by the king, sacrifice on f7 and check with the queen so it hits the piece the king has to protect.",
    result: "Clear advantage (about +1.1); Black's king is stranded in the centre",
  },
  {
    id: "fried-liver-kg8",
    type: "move",
    family: "Italian Game",
    opening: "Two Knights Defense: Fried Liver",
    side: "white",
    title: "7...Kg8?? -- running home after the Fried Liver",
    setup: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+",
    mistake: "Kg8",
    why: "Going back to g8 looks like the safest square, away from the centre.",
    punish: "8. Bxd5+ Qxd5 9. Qxd5+ Be6 10. Qxe6#",
    explain:
      "The f7 pawn is gone, so the a2-g8 diagonal leads straight to the king, and the bishop on f8 and rook on h8 leave it no room. 8.Bxd5+ removes the only blocker; after 8...Qxd5 9.Qxd5+ Be6 10.Qxe6 is mate. (8.Qxd5+ first works too.) Black had to play 7...Ke6.",
    takeaway:
      "A king that hides behind its own unmoved pieces with the f-pawn gone is a mating target on the open diagonal.",
    result: "Checkmate",
  },
  {
    id: "fried-liver-ke8",
    type: "move",
    family: "Italian Game",
    opening: "Two Knights Defense: Fried Liver",
    side: "white",
    title: "7...Ke8? -- back to the starting square",
    setup: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+",
    mistake: "Ke8",
    why: "It avoids the scary walk to e6 and keeps the king behind its pawns.",
    punish: "8. Bxd5 Qf6 9. Bxc6+ bxc6 10. Qh5+ Qf7 11. Qxf7+ Kxf7",
    explain:
      "On e8 the king no longer protects d5, so 8.Bxd5 just wins the knight. After 8...Qf6 9.Bxc6+ bxc6 10.Qh5+ the queens come off and White is a pawn up with Black's queenside pawns wrecked and king exposed. Black had to play 7...Ke6.",
    takeaway:
      "After the sacrifice, check which pieces the king was defending. If it steps away from them, take them.",
    result: "Winning endgame (about +3.5)",
  },
  {
    id: "blackburne-shilling",
    type: "move",
    family: "Italian Game",
    opening: "Blackburne Shilling Gambit",
    side: "white",
    title: "3...Nd4 -- don't take the bait",
    setup: "1. e4 e5 2. Nf3 Nc6 3. Bc4",
    mistake: "Nd4",
    why: "It's a trap: e5 now looks free. The 'natural' 4.Nxe5? Qg5! hits the knight and g2, and 5.Nxf7?? Qxg2 6.Rf1 Qxe4+ 7.Be2 Nf3# is a famous mate.",
    punish: "4. Nxd4 exd4 5. O-O",
    explain:
      "Exploit it calmly: 4.Nxd4 exd4 removes the annoying knight and leaves Black with a doubled, overextended d-pawn and no development. Castle, then hit the pawn with c3 or Re1. White is simply better.",
    takeaway:
      "When an opponent moves the same piece twice to set a trap, don't grab the bait -- trade the trap piece and take the lead in development.",
    result: "Clear advantage (about +1.3)",
  },
  {
    id: "legal-mate",
    type: "move",
    family: "Philidor Defense",
    opening: "Philidor Defense",
    side: "white",
    title: "4...g6? -- Légal's mate",
    setup: "1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3",
    mistake: "g6",
    why: "Black thinks the pin on f3 stops White's knight from moving, so there's time for a quiet fianchetto.",
    punish: "5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#",
    explain:
      "The pin isn't real: 5.Nxe5! offers the queen. Taking it walks into Légal's mate, 6.Bxf7+ Ke7 7.Nd5#. Black's best is 5...dxe5 6.Qxg4, and White is simply a healthy pawn up.",
    takeaway:
      "A pin against the queen is not absolute. If moving the pinned piece creates mating threats, the queen can be given away.",
    result: "Checkmate (or a clean extra pawn after 5...dxe5)",
    notes: {
      Bxd1: "Taking the queen is the losing mistake. Best was 5...dxe5 6.Qxg4, where Black is just a pawn down.",
    },
  },
  {
    id: "italian-moller-ne4",
    type: "move",
    family: "Italian Game",
    opening: "Giuoco Piano: main line",
    side: "white",
    title: "6...Ne4? -- the knight jumps in",
    setup: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. e5",
    mistake: "Ne4",
    why: "The knight is attacked, and e4 is an active square that eyes f2.",
    punish: "7. Bd5 Nxf2 8. Kxf2 dxc3+ 9. Kg3",
    explain:
      "7.Bd5! attacks the e4 knight, which has no safe retreat. Black can only try 7...Nxf2 8.Kxf2 dxc3+, but after 9.Kg3 White's king is safe enough: White has a piece for a few pawns and the much better position. Black's correct move was 6...d5!, hitting the bishop.",
    takeaway:
      "A knight that jumps forward with no retreat squares can often be attacked and trapped. Look for a bishop or pawn move that hits it.",
    result: "Clear advantage (about +1.7)",
  },
  {
    id: "traxler",
    type: "move",
    family: "Italian Game",
    opening: "Two Knights Defense: Traxler Counterattack",
    side: "white",
    title: "4...Bc5 -- the Traxler",
    setup: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5",
    mistake: "Bc5",
    why: "Black ignores the threat on f7 and counterattacks f2, hoping for wild tactics.",
    punish: "5. Bxf7+ Ke7 6. Bc4",
    explain:
      "Take the pawn with the bishop and check: 5.Bxf7+ Ke7 6.Bc4. White is a pawn up, Black can never castle, and there are no tricks on f2 because the bishop is back covering it. 5.Nxf7 is also good but leads to very sharp lines after 5...Bxf2+. Black's sound move was 4...d5.",
    takeaway:
      "Against a speculative counterattack, take material in the way that keeps your own king safe, then retreat and consolidate.",
    result: "Clear advantage (about +1.1)",
  },

  // ------------------------------------------------------------ Ruy Lopez
  {
    id: "tarrasch-trap",
    type: "move",
    family: "Ruy Lopez",
    opening: "Open Ruy Lopez",
    side: "white",
    title: "11...Qd7? -- the Tarrasch trap",
    setup:
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Nxe4 6. d4 b5 7. Bb3 d5 8. dxe5 Be6 9. c3 Be7 10. Re1 O-O 11. Nd4",
    mistake: "Qd7",
    why: "The queen steps up to support e6 and connect the rooks -- normal-looking development.",
    punish: "12. Nxe6 fxe6 13. Rxe4",
    explain:
      "12.Nxe6 fxe6 removes the bishop, and now 13.Rxe4! wins the knight: if 13...dxe4 the d-file opens and 14.Qxd7 takes the queen. The d5 pawn is tied to the queen on d7. Black should have played 11...Nxe5.",
    takeaway:
      "When a pawn shields its own queen on an open file from yours, that pawn can't capture -- pieces it 'defends' are loose.",
    result: "Wins a piece (about +6)",
  },

  // ------------------------------------------------------------ Petrov
  {
    id: "petrov-nf6",
    type: "move",
    family: "Petrov's Defense",
    opening: "Petrov's Defense",
    side: "white",
    title: "4...Nf6?? -- the copycat retreat",
    setup: "1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nxe4 4. Qe2",
    mistake: "Nf6",
    why: "Copying White with 3...Nxe4 is common, and when the queen attacks the knight, retreating it is the obvious reply.",
    punish: "5. Nc6+ Be7 6. Nxd8",
    explain:
      "With the queen on e2 and Black's king on e8, any knight move is a discovered check. 5.Nc6+ checks and attacks the queen at the same time; after 5...Be7 6.Nxd8 White has won the queen. Black had to play 4...Qe7 (3...d6 before taking on e4 is the proper move order).",
    takeaway:
      "When your queen and the enemy king share a file with only your own piece between them, look for a discovered check where that piece also attacks something.",
    result: "Wins the queen",
  },

  // ------------------------------------------------------------ Sicilian
  {
    id: "dragon-ng4",
    type: "move",
    family: "Sicilian Defense",
    opening: "Sicilian Defense: Dragon setup",
    side: "white",
    title: "6...Ng4? -- kicking the bishop",
    setup: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3",
    mistake: "Ng4",
    why: "Attacking the bishop to grab the bishop pair is a normal idea in many openings.",
    punish: "7. Bb5+ Nc6 8. Nxc6 bxc6 9. Bxc6+ Bd7 10. Bxa8",
    explain:
      "7.Bb5+! The check uncovers the d1 queen onto the g4 knight. If 7...Bd7 8.Qxg4 wins the knight. After 7...Nc6 8.Nxc6 bxc6 9.Bxc6+ Bd7 10.Bxa8 White has won a full rook. Black should have played 6...Bg7 first.",
    takeaway:
      "Every time an enemy piece lands on the same line as your queen, ask whether a check by the piece in between wins it.",
    result: "Wins material (about +5)",
  },
  {
    id: "sicilian-pin-ne4",
    type: "move",
    family: "Sicilian Defense",
    opening: "Sicilian Defense: Pin Variation",
    side: "white",
    title: "6...Ne4? -- the knight hops forward",
    setup: "1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 Bb4 6. e5",
    mistake: "Ne4",
    why: "The knight is attacked and e4 looks active, hitting the pinned c3 knight a second time.",
    punish: "7. Qg4 Nxc3 8. Qxg7 Rf8 9. a3",
    explain:
      "7.Qg4! attacks the e4 knight and g7 at once. After 7...Nxc3 8.Qxg7 Rf8 9.a3 the b4 bishop is attacked and the c3 knight is about to fall, Black can't castle, and the dark squares around the king are broken. Black's correct move was 6...Nd5.",
    takeaway:
      "A queen move that hits two things at once (a loose piece and a weak pawn in front of the king) is the standard punishment for overextended knights.",
    result: "Clear advantage (about +2.6)",
  },

  // ------------------------------------------------------------ French
  {
    id: "milner-barry",
    type: "move",
    family: "French Defense",
    opening: "French Defense: Advance Variation",
    side: "white",
    title: "7...Nxd4? -- grabbing the d4 pawn",
    setup: "1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6 6. Bd3 cxd4 7. cxd4",
    mistake: "Nxd4",
    why: "Black has been aiming at d4 the whole opening and it looks undefended enough.",
    punish: "8. Nxd4 Qxd4 9. Bb5+",
    explain:
      "After 8.Nxd4 Qxd4?? 9.Bb5+ the check uncovers the d1 queen onto Black's queen on d4, which is lost. Even Black's best, 8...Bc5, runs into 9.Nb5! with Nd6+ ideas. Black should have played 7...Bd7.",
    takeaway:
      "A queen recapturing on your queen's file is a target for a discovered check. Count captures to the end before calling a pawn 'free'.",
    result: "Wins the queen",
    notes: {
      Qxd4: "Taking back loses the queen. Best was 8...Bc5, but after 9.Nb5! White is still winning.",
    },
  },

  // ------------------------------------------------------------ Caro-Kann
  {
    id: "caro-smothered",
    type: "move",
    family: "Caro-Kann Defense",
    opening: "Caro-Kann Defense: Karpov Variation",
    side: "white",
    title: "5...Ngf6?? -- smothered mate",
    setup: "1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nd7 5. Qe2",
    mistake: "Ngf6",
    why: "Developing the kingside knight to attack e4 is Black's normal plan in this line.",
    punish: "6. Nd6#",
    explain:
      "The queen on e2 pins the e7 pawn to the king, so it can't capture on d6. With the queen, f8 bishop and d7 knight boxing in the king, 6.Nd6 is mate. Black had to play 5...Ndf6 first.",
    takeaway:
      "When the enemy king is surrounded by its own undeveloped pieces and a pawn is pinned, look for a knight check nobody can capture.",
    result: "Checkmate",
  },

  // ------------------------------------------------------------ Queen's Gambit
  {
    id: "qga-b5",
    type: "move",
    family: "Queen's Gambit",
    opening: "Queen's Gambit Accepted",
    side: "white",
    title: "5...cxb5? -- holding on to the gambit pawn",
    setup: "1. d4 d5 2. c4 dxc4 3. e3 b5 4. a4 c6 5. axb5",
    mistake: "cxb5",
    why: "Black wants to keep the extra c4 pawn defended, and recapturing toward the centre is natural.",
    punish: "6. Qf3",
    explain:
      "With the b- and c-pawns gone, the long diagonal from f3 to a8 is empty. 6.Qf3 attacks the a8 rook, which can't move (knight and pawn in the way), and blocking with ...Nc6 or ...Bb7 just loses that piece. Black should have played 5...Nf6 or 5...e6.",
    takeaway:
      "Pawn grabs on the queenside open the long diagonal. Look for a queen move to f3 or b3 that hits an undeveloped rook in the corner.",
    result: "Wins material (about +5.6)",
  },
  {
    id: "slav-qb3",
    type: "move",
    family: "Queen's Gambit",
    opening: "Slav Defense: Exchange",
    side: "white",
    title: "6...Nc6? -- forgetting b7",
    setup: "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. e3 Bf5 5. cxd5 cxd5 6. Qb3",
    mistake: "Nc6",
    why: "Developing a piece is usually good, and the knight on c6 looks like it protects everything.",
    punish: "7. Qxb7 Bd7 8. Ne5",
    explain:
      "Once Black's bishop leaves c8, b7 is defended by nothing. 7.Qxb7 wins the pawn, and 8.Ne5 adds pressure on c6 and keeps the queen out of trouble. Black should have covered b7 with 6...Qb6 or 6...Qc7.",
    takeaway:
      "When the opponent develops their light-squared bishop early (Slav, London), check b7/b2. Qb3 hitting b7 and d5 is the standard punishment.",
    result: "Clear advantage (about +1.4), a pawn up",
  },

  // ------------------------------------------------------------ Dutch
  {
    id: "dutch-rh6",
    type: "move",
    family: "Dutch Defense",
    opening: "Dutch Defense",
    side: "white",
    title: "6...Rh6?? -- guarding the h-pawn",
    setup: "1. d4 f5 2. Bg5 h6 3. Bh4 g5 4. Bg3 f4 5. e3 h5 6. Bd3",
    mistake: "Rh6",
    why: "The bishop is threatening Bg6+, and the rook move seems to cover g6 and defend h5.",
    punish: "7. Qxh5+ Rxh5 8. Bg6#",
    explain:
      "With the f- and g-pawns pushed, the e8-h5 diagonal is wide open. 7.Qxh5+! Rxh5 8.Bg6 is mate. Black had to play 6...d5 or 6...Nf6.",
    takeaway:
      "When the opponent pushes the f- and g-pawns early, the e8-h5 diagonal is the weak spot. Look for a queen or bishop check there.",
    result: "Checkmate",
  },

  // ------------------------------------------------------------ Black: QGD
  {
    id: "elephant-trap",
    type: "move",
    family: "Queen's Gambit",
    opening: "Queen's Gambit Declined",
    side: "black",
    title: "6.Nxd5?? -- the Elephant trap",
    setup: "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 5. cxd5 exd5",
    mistake: "Nxd5",
    why: "The f6 knight looks pinned to the queen, so the d5 pawn seems free.",
    punish: "6... Nxd5 7. Bxd8 Bb4+ 8. Qd2 Bxd2+ 9. Kxd2 Kxd8",
    explain:
      "The pin is fake. 6...Nxd5! gives up the queen, but 7.Bxd8 Bb4+ forces 8.Qd2 Bxd2+ 9.Kxd2 Kxd8, and Black has won a whole piece. White's right move was 6.e3.",
    takeaway:
      "A pin against the queen can be broken if the capture starts a sequence of checks that wins the material back with interest.",
    result: "Wins a piece (about +5)",
  },
  {
    id: "lasker-trap",
    type: "move",
    family: "Queen's Gambit",
    opening: "Albin Countergambit",
    side: "black",
    title: "6.Bxb4?? -- the Lasker trap",
    setup: "1. d4 d5 2. c4 e5 3. dxe5 d4 4. e3 Bb4+ 5. Bd2 dxe3",
    mistake: "Bxb4",
    why: "The b4 bishop is hanging and taking a piece looks obviously right.",
    punish: "6... exf2+ 7. Ke2 fxg1=N+ 8. Ke1 Qh4+",
    explain:
      "6...exf2+ 7.Ke2 and now 7...fxg1=N+! -- promoting to a knight gives check (a queen would just be taken by Rxg1). After 8.Ke1 Qh4+ Black is winning. If 8.Rxg1, then 8...Bg4+ wins White's queen. White had to play 6.fxe3.",
    takeaway:
      "A pawn deep in the opponent's camp can be worth more than a piece. Before grabbing, count what the advanced pawn does next -- and remember underpromotion with check.",
    result: "Winning (about +7.5)",
  },
  {
    id: "kieninger-trap",
    type: "move",
    family: "Budapest Gambit",
    opening: "Budapest Gambit",
    side: "black",
    title: "8.axb4?? -- the Kieninger trap",
    setup: "1. d4 Nf6 2. c4 e5 3. dxe5 Ng4 4. Bf4 Nc6 5. Nf3 Bb4+ 6. Nbd2 Qe7 7. a3 Ngxe5",
    mistake: "axb4",
    why: "White just attacked the bishop with a3, so taking it seems completely natural.",
    punish: "8... Nd3#",
    explain:
      "8...Nd3 is mate. The e5 knight leaving opens the e-file, so the e7 queen pins the e2 pawn and it can't capture on d3; the d2 knight blocks White's queen from d3; and the king's own pieces fill every square around it. White's right move was 8.Nxe5.",
    takeaway:
      "When your queen sits on the same file as the uncastled enemy king, a knight check from d3 or f3 can be mate if the king's flight squares are blocked by its own pieces.",
    result: "Checkmate",
  },
  {
    id: "englund-trap",
    type: "move",
    family: "Englund Gambit",
    opening: "Englund Gambit",
    side: "black",
    title: "6.Bc3?? -- chasing the queen",
    setup: "1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2",
    mistake: "Bc3",
    why: "Attacking a queen that has gone pawn-grabbing feels like the right way to punish it.",
    punish: "6... Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1#",
    explain:
      "6...Bb4! pins the c3 bishop. If 7.Qd2 Bxc3 8.Qxc3 Qc1 is mate -- the queen on c3 can't cover c1. Even the better 7.Bd2 loses the a1 rook after 7...Qxa1. White should have played 6.Nc3.",
    takeaway:
      "Before attacking a raiding queen, check where it can go next -- especially checks on your back rank.",
    result: "Checkmate (or wins the rook)",
    notes: {
      Qd2: "This walks into mate. 7.Bd2 was better, but 7...Qxa1 still wins a rook.",
    },
  },

  // ------------------------------------------------------------ Black: e4 openings
  {
    id: "noahs-ark",
    type: "move",
    family: "Ruy Lopez",
    opening: "Ruy Lopez: Steinitz Deferred",
    side: "black",
    title: "8.Qxd4?? -- the Noah's Ark trap",
    setup: "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 d6 5. d4 b5 6. Bb3 Nxd4 7. Nxd4 exd4",
    mistake: "Qxd4",
    why: "White is just winning back the pawn with a centralised queen.",
    punish: "8... c5 9. Qc3 c4 10. a4 cxb3",
    explain:
      "8...c5! kicks the queen with tempo and then 9...c4 traps the b3 bishop behind Black's a6-b5-c4 pawn chain. White wins a pawn or two back for the piece, but Black is clearly winning. White should have played 8.a4 first.",
    takeaway:
      "A bishop on b3 (or b6) facing pawns on a6/b5 can be trapped by ...c5-c4. Look for it whenever you can gain a tempo on the queen.",
    result: "Wins a piece (about +4.4)",
  },
  {
    id: "siberian-trap",
    type: "move",
    family: "Sicilian Defense",
    opening: "Sicilian Defense: Smith-Morra Gambit",
    side: "black",
    title: "9.h3?? -- the Siberian trap",
    setup: "1. e4 c5 2. d4 cxd4 3. c3 dxc3 4. Nxc3 Nc6 5. Nf3 e6 6. Bc4 Qc7 7. O-O Nf6 8. Qe2 Ng4",
    mistake: "h3",
    why: "Kicking a knight that has jumped into your half is the natural reaction.",
    punish: "9... Nd4 10. hxg4 Nxe2+ 11. Bxe2",
    explain:
      "The c7 queen and g4 knight already aim at h2; only the f3 knight defends it. 9...Nd4! attacks White's queen, and if 10.Nxd4 the f3 knight has left h2, so 10...Qh2 is mate. White has to give up the queen with 10.hxg4 Nxe2+. White's right move was 9.Rd1.",
    takeaway:
      "When a single piece guards the mating square, attack something with tempo that it must leave to deal with.",
    result: "Wins the queen for a knight (about +4.7)",
  },
  {
    id: "fishing-pole",
    type: "move",
    family: "Ruy Lopez",
    opening: "Ruy Lopez: Berlin Defense",
    side: "black",
    title: "6.hxg4?? -- the Fishing Pole",
    setup: "1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Ng4 5. h3 h5",
    mistake: "hxg4",
    why: "The knight is just hanging, and taking a free piece is hard to resist.",
    punish: "6... hxg4 7. Ne1 Qh4 8. f3 g3",
    explain:
      "6...hxg4 opens the h-file for Black's rook and hits the f3 knight. After 7.Ne1 Qh4 8.f3 g3 mate on h2 can't be stopped. Even White's best, 7.c3, leaves Black winning (about -4). White should have played 6.c3 instead of taking.",
    takeaway:
      "Once you have a rook behind your h-pawn, a 'free' piece on g4 can be bait. Opening the h-file against a castled king is worth a knight.",
    result: "Checkmate next move",
    notes: {
      Ne1: "Natural but fatal. 7.c3 was the best try, and Black is still winning.",
    },
  },
  {
    id: "stafford-bg5",
    type: "move",
    family: "Petrov's Defense",
    opening: "Petrov's Defense: Stafford Gambit",
    side: "black",
    title: "6.Bg5?? -- pinning the knight",
    setup: "1. e4 e5 2. Nf3 Nf6 3. Nxe5 Nc6 4. Nxc6 dxc6 5. d3 Bc5",
    mistake: "Bg5",
    why: "Pinning the f6 knight to the queen is a standard developing move.",
    punish: "6... Nxe4 7. Bxd8 Bxf2+ 8. Ke2 Bg4#",
    explain:
      "6...Nxe4! The pin is fake again. 7.Bxd8 Bxf2+ 8.Ke2 Bg4 is mate. White's best after 6...Nxe4 is 7.Qe2, but Black is still winning. White should have played 6.Be2.",
    takeaway:
      "In gambits, an uncastled king plus Black's bishop on c5 aiming at f2 means pins against your queen usually don't hold.",
    result: "Checkmate",
    notes: {
      Bxd8: "Taking the queen allows mate. 7.Qe2 was best, and Black is still winning.",
    },
  },
  {
    id: "kings-gambit-fxe5",
    type: "move",
    family: "King's Gambit",
    opening: "King's Gambit Declined: Classical",
    side: "black",
    title: "3.fxe5?? -- taking the e5 pawn",
    setup: "1. e4 e5 2. f4 Bc5",
    mistake: "fxe5",
    why: "Winning the e5 pawn is what the King's Gambit is all about.",
    punish: "3... Qh4+ 4. g3 Qxe4+ 5. Qe2 Qxh1",
    explain:
      "With the f-pawn gone, 3...Qh4+ forces 4.g3, which opens the long diagonal to h1. Then 4...Qxe4+ forks the king and the h1 rook, and Black wins the rook. White should have played 3.Nf3.",
    takeaway:
      "When the opponent opens the e1-h4 diagonal, a queen check on h4 that's blocked by g3 often lets the queen swing to e4 and fork the king and rook.",
    result: "Wins a rook (about +5.4)",
  },

  // ------------------------------------------------------------ Patterns: Greek gift
  {
    id: "gg-yes-qg",
    type: "decide",
    family: "Patterns: Greek gift (Bxh7+)",
    opening: "Queen's Gambit structure",
    side: "white",
    title: "Greek gift #1 -- Black's bishop on b4",
    fen: "rnbq1rk1/pp3ppp/2p1p3/3nP3/1b1P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10",
    question: "Black has castled kingside. Is the sacrifice Bxh7+ sound here?",
    answer: true,
    punish: "10. Bxh7+ Kxh7 11. Ng5+ Kg8 12. Qh5 Qxg5 13. Bxg5",
    explain:
      "Every condition is met: the d3 bishop hits h7, the e5 pawn keeps Black's knight away from f6, Black's bishop is on b4 so nothing can take a knight on g5, and the queen reaches h5 once the f3 knight moves. After 11...Kg8 12.Qh5 threatens Qh7#, and Black has to give up the queen with 12...Qxg5. (11...Kg6 doesn't help either; White's attack is still winning.)",
    takeaway: "Run the checklist before every Bxh7+: bishop, knight to g5, queen to h5, no defender on f6.",
    result: "Wins the queen for two pieces (about +7.7)",
  },
  {
    id: "gg-no-qg-be7",
    type: "decide",
    family: "Patterns: Greek gift (Bxh7+)",
    opening: "Queen's Gambit structure",
    side: "white",
    title: "Greek gift #2 -- same position, bishop on e7",
    fen: "rnbq1rk1/pp2bppp/2p1p3/3nP3/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10",
    question: "Same structure, but Black's bishop is on e7. Is Bxh7+ sound now?",
    answer: false,
    better: "10. Qc2",
    explain:
      "No. After 10.Bxh7+ Kxh7 11.Ng5+, the e7 bishop simply takes the knight (11...Bxg5), and with no pawn on h4 to recapture and open the h-file, the attack is over and White is a piece down (about -2.4). Instead 10.Qc2 lines up on h7 and forces Black to weaken the kingside with ...h6 or ...g6 or ...f5 -- White keeps a clear edge (about +3.2).",
    takeaway: "A Black bishop on e7 (or f6) that can capture on g5 is the most common reason the Greek gift fails.",
    result: "Bxh7+ loses about 2.4 pawns; Qc2 keeps about +3.2",
  },
  {
    id: "gg-yes-french",
    type: "decide",
    family: "Patterns: Greek gift (Bxh7+)",
    opening: "French Defense structure",
    side: "white",
    title: "Greek gift #3 -- French structure",
    fen: "rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 0 8",
    question: "Is Bxh7+ sound here?",
    answer: true,
    punish: "8. Bxh7+ Kxh7 9. Ng5+ Kg8 10. Qh5 Qxg5 11. Bxg5",
    explain:
      "Yes -- this is the textbook setup. Bishop on d3, knight ready for g5, nothing can take it (Black's bishop is on b4), the queen goes to h5 next, and the e5 pawn keeps the d7 knight from reaching f6. After 10.Qh5 the mate threat on h7 forces Black to give up the queen.",
    takeaway: "e5 pawn + Bd3 + Nf3 + queen able to reach h5 + no Black knight on f6 = Bxh7+ usually works.",
    result: "Wins the queen for two pieces (about +7.3)",
  },
  {
    id: "gg-no-french-nd2",
    type: "decide",
    family: "Patterns: Greek gift (Bxh7+)",
    opening: "French Defense structure",
    side: "white",
    title: "Greek gift #4 -- no knight on f3",
    fen: "rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB4/PPPN1PPP/R1BQ1RK1 w - - 0 8",
    question: "Same as #3, but White's knight is on d2 instead of f3. Is Bxh7+ sound?",
    answer: false,
    better: "8. Qh5",
    explain:
      "No. Without a knight that can reach g5, there's no follow-up after 8.Bxh7+ Kxh7 -- Qh5+ alone just chases the king to g8, and White is a piece down (about -2.5). Here the queen can go to h5 directly (8.Qh5), forcing ...f5 or ...g6 and keeping a good attack (about +2.4).",
    takeaway: "The sacrifice needs the knight check on g5 to keep the king from running and to let the queen in.",
    result: "Bxh7+ loses about 2.5 pawns; Qh5 keeps about +2.4",
  },
  {
    id: "gg-no-french-nf6",
    type: "decide",
    family: "Patterns: Greek gift (Bxh7+)",
    opening: "French / Colle structure",
    side: "white",
    title: "Greek gift #5 -- knight on f6",
    fen: "rnbq1rk1/ppp2ppp/4pn2/3p4/1b1P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 8",
    question: "No pawn on e5 here, and Black's knight sits on f6. Is Bxh7+ sound?",
    answer: false,
    better: "8. a3",
    explain:
      "No. The f6 knight defends h7, so 8.Bxh7+ is answered by 8...Nxh7 and White has simply lost a bishop (about -6.5). This is why White players push e4-e5 first: kicking the f6 knight is what makes h7 weak. Normal development (8.a3, asking the b4 bishop what it's doing) keeps the position balanced.",
    takeaway: "No Greek gift while a Black knight sits on f6. Drive it away first (e4-e5), or trade it off.",
    result: "Bxh7+ loses a piece",
  },
];

/** SAN tokens of a "1. e4 e5 2. Nf3 ..." string (move numbers stripped). */
export function sanTokens(text) {
  return (text ?? "")
    .replace(/\.\.\./g, " ")
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.*$/.test(t));
}

// Alternative moves the engine rates as equally good, by ply index into `punish`.
const ALTS = {
  "fried-liver-kg8": { 0: ["Qxd5+"] },
  "fried-liver-ke8": { 4: ["Qe3", "Qe2"], 6: ["Qe2"] },
  "blackburne-shilling": { 0: ["O-O"], 2: ["d3"] },
  "dragon-ng4": { 6: ["Bd4"] },
  traxler: { 0: ["Nxf7"], 2: ["Bd5", "Bb3"] },
  "elephant-trap": { 4: ["Kxd8"] },
  "fishing-pole": { 4: ["Bc5+"] },
  "gg-yes-qg": { 6: ["Qxg5"] },
  "gg-yes-french": { 4: ["Qd3"], 6: ["Qxg5"] },
};
for (const l of LESSONS) l.alts = ALTS[l.id] ?? {};
