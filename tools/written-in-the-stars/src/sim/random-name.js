// Names for random lives: an ordinary-looking American name for the birth year and sex.
//
// Given names follow the Social Security Administration's lists of the most popular baby names by decade (the top
// 25 or so, in rank order, with a few common names from just below the top that most American classrooms of the time
// had), written here from those published lists. Surnames are weighted roughly by the 2010 Census surname counts
// (per 100,000 people). They only make random lives read naturally; nothing is computed from these weights.
const SURNAMES = [
  ["Smith", 828], ["Johnson", 655], ["Williams", 551], ["Brown", 487], ["Jones", 483], ["Garcia", 377], ["Miller", 377],
  ["Davis", 360], ["Rodriguez", 352], ["Martinez", 345], ["Hernandez", 342], ["Lopez", 296], ["Gonzalez", 284],
  ["Wilson", 274], ["Anderson", 270], ["Thomas", 258], ["Taylor", 256], ["Moore", 246], ["Jackson", 240], ["Martin", 236],
  ["Lee", 228], ["Perez", 225], ["Thompson", 224], ["White", 221], ["Harris", 211], ["Sanchez", 207], ["Clark", 190],
  ["Ramirez", 189], ["Lewis", 182], ["Robinson", 179], ["Walker", 178], ["Young", 168], ["Allen", 166], ["King", 165],
  ["Wright", 163], ["Scott", 155], ["Torres", 152], ["Nguyen", 152], ["Hill", 150], ["Flores", 150], ["Green", 147],
  ["Adams", 145], ["Nelson", 144], ["Baker", 142], ["Hall", 140], ["Rivera", 138], ["Campbell", 130], ["Mitchell", 129],
  ["Carter", 128], ["Roberts", 127], ["Phillips", 113], ["Evans", 112], ["Turner", 112], ["Parker", 110], ["Collins", 107],
  ["Edwards", 106], ["Stewart", 105], ["Morris", 102], ["Murphy", 100], ["Cook", 99], ["Rogers", 99], ["Morgan", 93],
  ["Peterson", 92], ["Cooper", 91], ["Reed", 91], ["Bailey", 90], ["Bell", 89], ["Kelly", 85], ["Howard", 84],
  ["Ward", 84], ["Cox", 82], ["Richardson", 81], ["Wood", 81], ["Brooks", 80], ["Bennett", 79], ["Gray", 78],
  ["James", 78], ["Reyes", 77], ["Cruz", 77], ["Hughes", 76], ["Price", 76], ["Myers", 75], ["Long", 74], ["Foster", 74],
  ["Sanders", 73], ["Ross", 73], ["Morales", 72], ["Powell", 71], ["Sullivan", 71], ["Russell", 70], ["Ortiz", 70],
  ["Jenkins", 69], ["Gutierrez", 69], ["Perry", 68], ["Butler", 67], ["Barnes", 67], ["Fisher", 66], ["Henderson", 66],
  ["Coleman", 66], ["Simmons", 65], ["Patterson", 64], ["Jordan", 63], ["Reynolds", 62], ["Hamilton", 61], ["Graham", 61],
  ["Kim", 61], ["Gonzales", 61], ["Alexander", 60], ["Ramos", 60], ["Wallace", 59], ["Griffin", 59], ["West", 58],
  ["Cole", 58], ["Hayes", 57], ["Chavez", 57], ["Gibson", 57], ["Bryant", 56], ["Ellis", 56], ["Stevens", 56],
  ["Patel", 50], ["Chen", 40], ["Wang", 36], ["Schmidt", 32], ["Singh", 32], ["Cohen", 25], ["O'Brien", 24], ["Kowalski", 9],
];

// By sex and decade of birth, most popular first.
const GIVEN = {
  female: {
    1950: ["Mary", "Linda", "Patricia", "Susan", "Deborah", "Barbara", "Debra", "Karen", "Nancy", "Donna", "Cynthia", "Sandra", "Pamela", "Sharon", "Kathleen", "Carol", "Diane", "Brenda", "Cheryl", "Janet", "Elizabeth", "Kathy", "Margaret", "Janice", "Carolyn", "Gloria", "Maria"],
    1960: ["Lisa", "Mary", "Susan", "Karen", "Kimberly", "Patricia", "Linda", "Donna", "Michelle", "Cynthia", "Sandra", "Deborah", "Tammy", "Pamela", "Lori", "Laura", "Elizabeth", "Julie", "Brenda", "Jennifer", "Barbara", "Angela", "Sharon", "Debra", "Teresa", "Maria", "Denise"],
    1970: ["Jennifer", "Amy", "Melissa", "Michelle", "Kimberly", "Lisa", "Angela", "Heather", "Stephanie", "Nicole", "Jessica", "Elizabeth", "Rebecca", "Kelly", "Mary", "Christina", "Amanda", "Julie", "Sarah", "Laura", "Shannon", "Christine", "Tammy", "Tracy", "Karen", "Maria", "Erica", "Tanya"],
    1980: ["Jessica", "Jennifer", "Amanda", "Ashley", "Sarah", "Stephanie", "Melissa", "Nicole", "Elizabeth", "Heather", "Tiffany", "Michelle", "Amber", "Megan", "Amy", "Rachel", "Kimberly", "Christina", "Lauren", "Crystal", "Brittany", "Rebecca", "Laura", "Danielle", "Emily", "Maria", "Erica", "Vanessa"],
    1990: ["Jessica", "Ashley", "Emily", "Sarah", "Samantha", "Amanda", "Brittany", "Elizabeth", "Taylor", "Megan", "Hannah", "Kayla", "Lauren", "Stephanie", "Rachel", "Jennifer", "Nicole", "Alexis", "Victoria", "Amber", "Alyssa", "Courtney", "Danielle", "Rebecca", "Jasmine", "Maria", "Destiny"],
    2000: ["Emily", "Madison", "Emma", "Olivia", "Hannah", "Abigail", "Isabella", "Samantha", "Elizabeth", "Ashley", "Alexis", "Sarah", "Sophia", "Alyssa", "Grace", "Ava", "Taylor", "Brianna", "Lauren", "Chloe", "Natalie", "Kayla", "Jessica", "Anna", "Victoria", "Destiny", "Jasmine", "Gabriela"],
    2010: ["Emma", "Olivia", "Sophia", "Isabella", "Ava", "Mia", "Abigail", "Emily", "Charlotte", "Madison", "Elizabeth", "Amelia", "Evelyn", "Ella", "Chloe", "Harper", "Avery", "Sofia", "Grace", "Addison", "Victoria", "Lily", "Natalie", "Aubrey", "Zoey", "Camila", "Aaliyah"],
    2020: ["Olivia", "Emma", "Charlotte", "Amelia", "Sophia", "Ava", "Isabella", "Mia", "Evelyn", "Harper", "Luna", "Camila", "Gianna", "Elizabeth", "Eleanor", "Ella", "Abigail", "Sofia", "Avery", "Scarlett", "Emily", "Aria", "Penelope", "Chloe", "Layla", "Nova", "Aaliyah"],
  },
  male: {
    1950: ["James", "Michael", "Robert", "John", "David", "William", "Richard", "Thomas", "Mark", "Charles", "Steven", "Gary", "Joseph", "Donald", "Ronald", "Kenneth", "Paul", "Larry", "Daniel", "Stephen", "Dennis", "Timothy", "Edward", "Jeffrey", "George", "Jose", "Willie"],
    1960: ["Michael", "David", "John", "James", "Robert", "Mark", "William", "Richard", "Thomas", "Jeffrey", "Steven", "Joseph", "Timothy", "Kevin", "Scott", "Brian", "Charles", "Paul", "Daniel", "Christopher", "Kenneth", "Anthony", "Gregory", "Ronald", "Donald", "Jose", "Carlos"],
    1970: ["Michael", "Christopher", "Jason", "David", "James", "John", "Robert", "Brian", "William", "Matthew", "Joseph", "Daniel", "Kevin", "Eric", "Jeffrey", "Richard", "Scott", "Mark", "Steven", "Thomas", "Timothy", "Anthony", "Charles", "Joshua", "Ryan", "Jose", "Juan", "Marcus"],
    1980: ["Michael", "Christopher", "Matthew", "Joshua", "David", "James", "Daniel", "Robert", "John", "Joseph", "Jason", "Justin", "Andrew", "Ryan", "William", "Brian", "Brandon", "Jonathan", "Nicholas", "Anthony", "Eric", "Adam", "Kevin", "Thomas", "Steven", "Jose", "Carlos", "Luis"],
    1990: ["Michael", "Christopher", "Matthew", "Joshua", "Jacob", "Nicholas", "Andrew", "Daniel", "Tyler", "Joseph", "Brandon", "David", "James", "Ryan", "John", "Zachary", "Justin", "William", "Anthony", "Robert", "Jonathan", "Austin", "Alexander", "Kyle", "Kevin", "Jose", "Luis", "Juan"],
    2000: ["Jacob", "Michael", "Joshua", "Matthew", "Daniel", "Christopher", "Andrew", "Ethan", "Joseph", "William", "Anthony", "David", "Alexander", "Nicholas", "Ryan", "Tyler", "James", "John", "Jonathan", "Noah", "Brandon", "Christian", "Dylan", "Samuel", "Benjamin", "Jose", "Angel", "Elijah"],
    2010: ["Noah", "Liam", "Jacob", "William", "Mason", "Ethan", "Michael", "Alexander", "James", "Elijah", "Benjamin", "Daniel", "Aiden", "Logan", "Jayden", "Matthew", "Lucas", "David", "Jackson", "Joseph", "Anthony", "Samuel", "Joshua", "Gabriel", "Andrew", "Sebastian", "Mateo"],
    2020: ["Liam", "Noah", "Oliver", "Elijah", "James", "William", "Benjamin", "Lucas", "Henry", "Theodore", "Mateo", "Levi", "Sebastian", "Daniel", "Jack", "Michael", "Alexander", "Owen", "Asher", "Samuel", "Ethan", "Leo", "Jackson", "Hudson", "Ezra", "Santiago", "Josiah"],
  },
};
export const NAME_DECADES = Object.keys(GIVEN.female).map(Number);

// What friends call you: the everyday short form of a given name, when it has a common one.
export const NICKNAMES = {
  Michael: ["Mike", "Mikey"], Christopher: ["Chris"], Robert: ["Bob", "Rob", "Bobby"], William: ["Will", "Bill", "Billy"],
  James: ["Jim", "Jimmy", "Jamie"], Joseph: ["Joe", "Joey"], Daniel: ["Dan", "Danny"], Matthew: ["Matt"], Joshua: ["Josh"],
  Nicholas: ["Nick"], Anthony: ["Tony"], Richard: ["Rick", "Rich"], Thomas: ["Tom", "Tommy"], Steven: ["Steve"],
  Stephen: ["Steve"], Timothy: ["Tim"], Kenneth: ["Ken", "Kenny"], Jeffrey: ["Jeff"], Gregory: ["Greg"], Donald: ["Don"],
  Ronald: ["Ron", "Ronnie"], Edward: ["Ed", "Eddie"], Charles: ["Charlie", "Chuck"], Andrew: ["Andy", "Drew"],
  Jonathan: ["Jon"], Benjamin: ["Ben"], Alexander: ["Alex"], Samuel: ["Sam"], Zachary: ["Zach"], Theodore: ["Teddy", "Theo"],
  Jacob: ["Jake"], Gabriel: ["Gabe"], Patrick: ["Pat"], Lawrence: ["Larry"], Dennis: ["Denny"],
  Jennifer: ["Jen", "Jenny"], Elizabeth: ["Liz", "Beth", "Lizzie"], Patricia: ["Patty", "Trish"], Deborah: ["Debbie", "Deb"],
  Debra: ["Debbie"], Kimberly: ["Kim"], Rebecca: ["Becky", "Becca"], Jessica: ["Jess"], Samantha: ["Sam"],
  Abigail: ["Abby"], Victoria: ["Tori", "Vicky"], Christina: ["Tina", "Chris"], Stephanie: ["Steph"], Katherine: ["Kate", "Katie"],
  Kathleen: ["Kathy"], Margaret: ["Peggy", "Maggie"], Cynthia: ["Cindy"], Pamela: ["Pam"], Susan: ["Sue", "Susie"],
  Barbara: ["Barb"], Michelle: ["Shelly"], Danielle: ["Dani"], Alexis: ["Lexi"], Madison: ["Maddie"], Isabella: ["Bella", "Izzy"],
  Natalie: ["Nat"], Gabriela: ["Gabby"], Penelope: ["Penny"], Eleanor: ["Ellie"], Amanda: ["Mandy"], Melissa: ["Missy", "Mel"],
};

const rankWeighted = list => list.map((n, i) => [n, 1 / (i + 6)]);
export const randomSurname = rng => rng.weighted(SURNAMES);
export function givenName(rng, birthYear, sex) {
  const decade = Math.max(1950, Math.min(2020, Math.floor(birthYear / 10) * 10));
  return rng.weighted(rankWeighted(GIVEN[sex === "female" ? "female" : "male"][decade]));
}
export const randomName = (rng, birthYear, sex) => `${givenName(rng, birthYear, sex)} ${randomSurname(rng)}`;
// A nickname for a given name, or the name itself when it has none.
export const nicknameOf = (given, rng) => (NICKNAMES[given] ? rng.pick(NICKNAMES[given]) : given);

// Every surname and given name, for the tests.
export const ALL_NAME_PARTS = { surnames: SURNAMES.map(([s]) => s), given: Object.values(GIVEN).flatMap(byDecade => Object.values(byDecade).flat()) };
