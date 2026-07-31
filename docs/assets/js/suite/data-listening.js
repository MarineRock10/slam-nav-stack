/* ============================================================
 * slam-nav-stack :: acoustic telemetry datasets (IELTS listening)
 *
 * Five practice sets, ten items each, all sentences original.
 * Item types:
 *   dictation : hear the sentence, type the missing word
 *   choice    : hear the sentence, pick the paraphrase (4 options)
 *   number    : hear it, type the number / time / date
 *   gapfill   : hear the passage, fill 2-3 gaps
 *
 * Answers are normalised on check (lowercase, punctuation stripped).
 * ============================================================ */
window.LISTENING_SETS = [
  {
    id: "L1", title: "ACOUSTIC SET 01", topic: "CAMPUS LIFE", rate: 0.85,
    items: [
      { type: "dictation", audio: "The library opens at nine o'clock on weekdays.",
        prompt: "The ______ opens at nine o'clock on weekdays.", answer: "library" },
      { type: "dictation", audio: "The seminar has been moved to room three hundred and two.",
        prompt: "The seminar has been moved to ______ 302.", answer: "room" },
      { type: "choice", audio: "The main lecture hall seats over four hundred students.",
        q: "What does the speaker say about the main lecture hall?",
        options: ["It is being rebuilt", "It holds more than 400 students", "It was closed last term", "It has no air conditioning"], answer: 1,
        explain: "The hall 'seats over four hundred students' = holds more than 400." },
      { type: "dictation", audio: "You must register for the course before the end of this week.",
        prompt: "You must ______ for the course before the end of this week.", answer: "register" },
      { type: "number", audio: "The campus tour lasts for two hours and forty-five minutes.",
        q: "How long does the campus tour last?", answer: ["2 hours 45 minutes", "two hours forty five minutes", "2 h 45 min", "165 minutes"] },
      { type: "choice", audio: "Rather than buying new textbooks, most students borrow them from the library.",
        q: "According to the speaker, how do most students get textbooks?",
        options: ["They buy new ones", "They borrow from the library", "They share with tutors", "They download free copies"], answer: 1,
        explain: "'Rather than buying new textbooks, most students borrow them' = they borrow from the library." },
      { type: "gapfill", audio: "The careers office runs workshops every Tuesday afternoon. Students can book a one-to-one session with an advisor, and the service is completely free of charge.",
        q: "The careers office runs workshops every 1) ______ afternoon. Students can book a 2) ______ session with an advisor.",
        blanks: ["tuesday", "one to one"], explain: "Workshops run on Tuesday afternoons; sessions are one-to-one with an advisor." },
      { type: "dictation", audio: "Parking permits are available from the security office on the ground floor.",
        prompt: "Parking permits are available from the ______ office.", answer: "security" },
      { type: "choice", audio: "The student union will refund the full cost of the trip if it is cancelled.",
        q: "What happens if the trip is cancelled?",
        options: ["Students get a partial refund", "The trip is postponed", "Students get a full refund", "Students lose their deposit"], answer: 2,
        explain: "'Refund the full cost' = get a full refund." },
      { type: "number", audio: "The next intake of students begins on the twenty-fifth of September.",
        q: "When does the next intake begin? (date)", answer: ["25 september", "september 25", "sept 25", "25/09", "25th september"] }
    ]
  },
  {
    id: "L2", title: "ACOUSTIC SET 02", topic: "TRAVEL & ACCOMMODATION", rate: 0.85,
    items: [
      { type: "dictation", audio: "The apartment is fully furnished and within walking distance of the station.",
        prompt: "The apartment is fully ______ and near the station.", answer: "furnished" },
      { type: "number", audio: "The monthly rent is six hundred and fifty pounds including bills.",
        q: "What is the monthly rent? (including bills)", answer: ["650", "£650", "650 pounds", "six hundred and fifty pounds"] },
      { type: "choice", audio: "Guests are advised to confirm their booking at least forty-eight hours before arrival.",
        q: "What must guests do before arrival?",
        options: ["Pay a deposit", "Confirm their booking", "Send a passport copy", "Choose a room number"], answer: 1,
        explain: "'Advised to confirm their booking' = must confirm the booking." },
      { type: "dictation", audio: "Breakfast is served between half past seven and nine thirty.",
        prompt: "Breakfast is served between 7:30 and ______.", answer: "9:30" },
      { type: "gapfill", audio: "The coach departs from the city square at eight fifteen. Please arrive twenty minutes early, as the driver will not wait for late passengers.",
        q: "The coach departs from the city 1) ______ at 8:15. Arrive 2) ______ minutes early.",
        blanks: ["square", "twenty"], explain: "Departs from City Square; arrive 20 minutes early." },
      { type: "choice", audio: "Unfortunately, the sea-view rooms are fully booked, but we still have garden rooms available.",
        q: "What is available at the hotel?",
        options: ["Sea-view rooms", "Garden rooms", "Rooms with balconies", "Rooms on the top floor"], answer: 1,
        explain: "Sea-view rooms are 'fully booked'; garden rooms are still available." },
      { type: "dictation", audio: "You will need to show your passport when you collect the car keys.",
        prompt: "Show your ______ when collecting the car keys.", answer: "passport" },
      { type: "number", audio: "The tour includes a stop at the castle lasting one hour and a half.",
        q: "How long is the stop at the castle?", answer: ["1.5 hours", "one hour and a half", "90 minutes", "1 hour 30 minutes"] },
      { type: "choice", audio: "Bikes can be rented from the shop opposite the hostel for six pounds a day.",
        q: "Where can bikes be rented?",
        options: ["At the hostel reception", "From a shop opposite the hostel", "At the train station", "From the tour office"], answer: 1,
        explain: "Bikes are rented 'from the shop opposite the hostel'." },
      { type: "dictation", audio: "Please check out before eleven o'clock on the morning of your departure.",
        prompt: "Please ______ out before 11 a.m. on the day you leave.", answer: "check" }
    ]
  },
  {
    id: "L3", title: "ACOUSTIC SET 03", topic: "WORK & CAREERS", rate: 0.85,
    items: [
      { type: "choice", audio: "Although the salary is modest, the position offers excellent training opportunities.",
        q: "What is attractive about the position?",
        options: ["The high salary", "The training opportunities", "The short working hours", "The city location"], answer: 1,
        explain: "'Excellent training opportunities' are the attraction; the salary is only 'modest'." },
      { type: "dictation", audio: "Applicants should attach a copy of their degree certificate to the application form.",
        prompt: "Attach a copy of your degree ______ to the form.", answer: "certificate" },
      { type: "number", audio: "The interview will take place on Thursday the twelfth of June.",
        q: "When is the interview? (date)", answer: ["12 june", "june 12", "12/06", "thursday 12 june", "12th june"] },
      { type: "gapfill", audio: "New employees receive four weeks of training in their first month. After that, they work with a mentor who reviews their progress every Friday.",
        q: "New employees get 1) ______ weeks of training. A 2) ______ reviews progress every Friday.",
        blanks: ["four", "mentor"], explain: "Four weeks of training; a mentor reviews progress on Fridays." },
      { type: "dictation", audio: "All staff must complete the health and safety course before starting work.",
        prompt: "Staff must complete the health and ______ course.", answer: "safety" },
      { type: "choice", audio: "The company is currently expanding its operations into the Asian market.",
        q: "What is the company doing at present?",
        options: ["Reducing its workforce", "Expanding into Asia", "Closing its offices", "Changing its name"], answer: 1,
        explain: "'Currently expanding its operations into the Asian market' = expanding into Asia." },
      { type: "number", audio: "The deadline for applications is Friday, the third of October, at noon.",
        q: "When is the application deadline?", answer: ["3 october", "october 3", "3/10", "friday 3 october", "3rd october"] },
      { type: "dictation", audio: "Please address any questions about the contract to the human resources department.",
        prompt: "Questions about the ______ go to the HR department.", answer: "contract" },
      { type: "choice", audio: "Despite the economic downturn, the firm managed to increase its profits last year.",
        q: "How did the firm perform last year?",
        options: ["It lost money", "It increased profits", "It broke even", "It cut salaries"], answer: 1,
        explain: "'Despite the downturn... managed to increase its profits' = profits went up." },
      { type: "dictation", audio: "Your probation period lasts six months, after which your contract becomes permanent.",
        prompt: "The ______ period lasts six months.", answer: "probation" }
    ]
  },
  {
    id: "L4", title: "ACOUSTIC SET 04", topic: "HEALTH & ENVIRONMENT", rate: 0.85,
    items: [
      { type: "dictation", audio: "The clinic recommends a balanced diet and at least thirty minutes of exercise daily.",
        prompt: "The clinic recommends thirty minutes of ______ daily.", answer: "exercise" },
      { type: "choice", audio: "The new recycling programme has reduced the amount of household waste by a third.",
        q: "What effect has the recycling programme had?",
        options: ["Waste has increased", "Waste fell by one third", "Waste stayed the same", "Waste was banned"], answer: 1,
        explain: "'Reduced... by a third' = waste fell by one third." },
      { type: "number", audio: "The water temperature should be kept below twenty degrees to save energy.",
        q: "What temperature should the water be kept below?", answer: ["20", "20 degrees", "twenty degrees", "20°"] },
      { type: "gapfill", audio: "The volunteer group meets on the first Saturday of every month to clean the river bank. Gloves and rubbish bags are provided, but you should bring your own boots.",
        q: "The group meets on the first 1) ______ of the month. Bring your own 2) ______.",
        blanks: ["saturday", "boots"], explain: "First Saturday monthly; volunteers bring their own boots." },
      { type: "dictation", audio: "Scientists have recorded a steady decline in the number of migratory birds.",
        prompt: "There is a steady ______ in migratory birds.", answer: "decline" },
      { type: "choice", audio: "Rather than using plastic bottles, the canteen now offers free refills of filtered water.",
        q: "What has the canteen introduced?",
        options: ["Cheaper drinks", "Free water refills", "Recycled cups", "A ban on drinks"], answer: 1,
        explain: "'Offers free refills of filtered water' = free water refills." },
      { type: "dictation", audio: "Patients with mild symptoms are advised to rest at home and drink plenty of fluids.",
        prompt: "Mild cases: rest at home and drink plenty of ______.", answer: "fluids" },
      { type: "number", audio: "The air quality index reached one hundred and twenty on Tuesday.",
        q: "What was the air quality index on Tuesday?", answer: ["120", "one hundred and twenty", "120 index"] },
      { type: "choice", audio: "The council has decided to plant trees along the main road to reduce noise from traffic.",
        q: "Why will trees be planted along the main road?",
        options: ["To make the road prettier", "To reduce traffic noise", "To provide shade", "To attract wildlife"], answer: 1,
        explain: "Trees are planted 'to reduce noise from traffic'." },
      { type: "dictation", audio: "Please dispose of batteries at the collection point near the supermarket entrance.",
        prompt: "Dispose of ______ at the collection point.", answer: "batteries" }
    ]
  },
  {
    id: "L5", title: "ACOUSTIC SET 05", topic: "SHOPPING & SERVICES", rate: 0.85,
    items: [
      { type: "dictation", audio: "The store offers a full refund within thirty days if you keep the receipt.",
        prompt: "Full refund within thirty days if you keep the ______.", answer: "receipt" },
      { type: "choice", audio: "The supermarket has reduced the price of fresh vegetables by twenty percent this week.",
        q: "What is happening at the supermarket this week?",
        options: ["Vegetables are 20% cheaper", "Fruit is on sale", "The store is closing", "Prices are rising"], answer: 0,
        explain: "'Reduced the price of vegetables by 20%' = vegetables are 20% cheaper." },
      { type: "number", audio: "The delivery fee is three pounds for orders under fifty pounds, and free above that.",
        q: "What is the delivery fee for a £40 order?", answer: ["3", "3 pounds", "three pounds", "£3"] },
      { type: "gapfill", audio: "The pharmacy is open from nine in the morning until eight in the evening on weekdays. On Sundays, it closes two hours earlier.",
        q: "The pharmacy closes at 8 p.m. on 1) ______. On Sundays it closes 2) ______ hours earlier.",
        blanks: ["weekdays", "two"], explain: "Weekdays until 8 p.m.; Sundays close two hours earlier (6 p.m.)." },
      { type: "dictation", audio: "Customers can collect their orders from the counter marked collections.",
        prompt: "Collect orders from the counter marked '______'.", answer: "collections" },
      { type: "choice", audio: "If the item is out of stock, we will contact you within two working days.",
        q: "What happens if an item is out of stock?",
        options: ["The order is cancelled", "You are contacted within two days", "You get a discount", "A substitute is sent"], answer: 1,
        explain: "'We will contact you within two working days' = you are contacted within two days." },
      { type: "dictation", audio: "The membership card gives you ten percent off all purchases in store.",
        prompt: "Members get 10% off all ______ in store.", answer: "purchases" },
      { type: "number", audio: "The exhibition opens on Monday the second of November and runs for three weeks.",
        q: "When does the exhibition open?", answer: ["2 november", "november 2", "2/11", "monday 2 november", "2nd november"] },
      { type: "choice", audio: "The restaurant does not accept bookings for groups of fewer than six people.",
        q: "When can you book at the restaurant?",
        options: ["Any time", "Only for groups of six or more", "Only on weekends", "Only for lunch"], answer: 1,
        explain: "Bookings are accepted only for groups of 'six people' or more." },
      { type: "dictation", audio: "Please note that the swimming pool will be closed for maintenance next Monday.",
        prompt: "The pool is closed for ______ next Monday.", answer: "maintenance" }
    ]
  }
];
