const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const axios=require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // checkUpcomingContests();
    // setInterval(checkUpcomingContests, 1000);   to give contest reminders.  
});

client.on('messageCreate', (message) => { // says ping, replys pong, for testing purporses
    if (message.content === 'ping') {
        message.reply("```pong!```");
    }
});

const CODEFORCES_API_CONTEST = 'https://codeforces.com/api/contest.list';
const DISCORD_CHANNEL_ID = '1286232872616988683';

function formatStartTime(startTimeSeconds) {
  const date = new Date(startTimeSeconds * 1000); // Convert seconds to milliseconds
  return date.toLocaleString(); // Format the date in the user's locale
}

async function checkUpcomingContests() {
  try {
      const response = await axios.get(CODEFORCES_API_CONTEST);
      const contests = response.data.result;

      const upcomingContests = contests.filter(contest => contest.phase === 'BEFORE');

      console.log(upcomingContests[0]);

      if (upcomingContests.length > 0) {
          const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
          if (channel) {
              channel.send(`Upcoming contests:\n${upcomingContests.map(contest => `- **${contest.name}**\n  Starts at: ${formatStartTime( contest.startTimeSeconds)}`).join('\n')}`);
          } else {
              console.error('Channel not found.');
          }
      } else {
          console.log('No upcoming contests found.');
      }
  } catch (error) {
      console.error('Error:', error);
  }
}

/***************************************** */

const PREFIX = '!';

const CODEFORCES_API = 'https://codeforces.com/api/user.info?handles=';

const getRoleColor = (rating) => {
  if(rating === 0 ) return '#000000';
  if (rating < 1200) return '#808080'; // Gray
  if (rating < 1400) return '#008000'; // Green
  if (rating < 1600) return '#03a89e'; // Cyan
  if (rating < 1900) return '#0000ff'; // Blue
  if (rating < 2100) return '#aa00aa'; // Violet
  if (rating < 2300) return '#ff8c00'; // Orange
  if (rating < 2400) return '#ff0000'; // Red
  if (rating < 2600) return '#ff0000'; // Red (International Master)
  if (rating < 3000) return '#ff0000'; // Red (Grandmaster)
  return '#ff0000'; // Red (Legendary Grandmaster)
};

const getCfRole = (rating) =>{
    if(rating===0) return `unrated`;
    if(rating<1200) return `newbie`;
    if(rating<1400) return `pupil`;
    if(rating<1600) return `specialist`;
    if(rating<1900) return 'expert';
    if(rating<2100) return 'candidate master';
    if(rating<2300) return 'master';
    if(rating<2500) return 'international master';
    if(rating<2700) return 'grandmaster';
    if(rating<3000) return 'international grandmaster';
    if(rating<4000) return 'legendary grandmaster';
    return 'tourist';
}


client.on('messageCreate', async (message) => {     /* For catching Codeforces handles of users's */
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  console.log(args);

  if (command === 'handle') {
    const handle = args[0];
    if (!handle) {
      return message.reply('Please provide a Codeforces handle.');
    }

    try {
      const response = await axios.get(CODEFORCES_API + handle);
      const userData = response.data.result[0];
      const rating = userData.rating || 0;
      const color = getRoleColor(rating);

      //let role = message.guild.roles.cache.find(r => r.name === `CF_${handle}`);
      let role = message.guild.roles.cache.find(r => r.name === getCfRole(rating));
      console.log(role);
      if (!role) {
        role = await message.guild.roles.create({
          //name: `CF_${handle}`,
          name : getCfRole(rating),
          color: color,
          reason: 'Codeforces handle color role'
        });
      } else {
        await role.setColor(color);
      }

      await message.member.roles.add(role);
      message.reply(`Updated your role color based on Codeforces handle: ${handle} (Rating: ${rating})`);
    } catch (error) {
      console.error('Error:', error);
      message.reply('An error occurred while fetching Codeforces data. Please make sure the handle is correct.');
    }
  }
});



client.login(process.env.TOKEN);