const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
} = require("discord.js");
const axios = require("axios");
require("dotenv").config();
const fs = require("fs");
const express = require("express");
const app = express();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const CODEFORCES_API_CONTEST = "https://codeforces.com/api/contest.list";
const CODEFORCES_API_USER = "https://codeforces.com/api/user.info?handles=";
const DISCORD_CHANNEL_ID = "1287813194638688346";
const path = "./userdata.json";

const PREFIX = "/";

// Helper function to load user data from JSON
const loadUserData = () => {
  try {
    const data = fs.readFileSync(path, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.log("User data file not found or is empty, creating a new one...");
    return {};
  }
};

// Helper function to save user data to JSON
const saveUserData = (discordUsername, cfData) => {
  const users = loadUserData();
  users[discordUsername] = cfData;
  fs.writeFileSync(path, JSON.stringify(users, null, 2));
};

// Generate a unique verification code
const generateVerificationCode = () => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

// Helper to get CF role by rating
const getCfRole = (rating) => {
  if (rating === 0) return "unrated";
  if (rating < 1200) return "newbie";
  if (rating < 1400) return "pupil";
  if (rating < 1600) return "specialist";
  if (rating < 1900) return "expert";
  if (rating < 2100) return "candidate master";
  if (rating < 2300) return "master";
  if (rating < 2500) return "international master";
  if (rating < 2700) return "grandmaster";
  if (rating < 3000) return "international grandmaster";
  return "legendary grandmaster";
};

// Format contest time
const formatStartTime = (startTimeSeconds) => {
  console.log(startTimeSeconds)
  const date = new Date(startTimeSeconds * 1000);
  date.setHours(date.getHours() + 0); 

  return date.toLocaleString();
};

// Function to check upcoming contests
const checkUpcomingContests = async () => {
  try {
    const response = await axios.get(CODEFORCES_API_CONTEST);
    const contests = response.data.result;
    const upcomingContests = contests.filter(
      (contest) => contest.phase === "BEFORE"
    );

    if (upcomingContests.length > 0) {
      const channel = client.channels.cache.get(DISCORD_CHANNEL_ID);
      if (channel) {
        channel.send(
          `Upcoming contests:\n${upcomingContests
            .map(
              (contest) =>
                `- **${contest.name}**\n  Starts at: ${formatStartTime(
                  contest.startTimeSeconds
                )}`
            )
            .join("\n")}`
        );
      } else {
        console.error("Channel not found.");
      }
    } else {
      console.log("No upcoming contests found.");
    }
  } catch (error) {
    console.error("Error:", error);
  }
};

// Set interval to check contests
setInterval(checkUpcomingContests, 3600000); // Check every hour

// Update user role based on rating
const updateUserRole = async (interaction, discordUsername, handle) => {
  try {
    const response = await axios.get(`${CODEFORCES_API_USER}${handle}`);
    const userProfile = response.data.result[0];
    const rating = userProfile.rating || 0;

    const guild = interaction.guild;
    let role = guild.roles.cache.find((r) => r.name === getCfRole(rating));
    if (!role) {
      console.error("Role not found.");
      return;
    }

    const member = await guild.members.fetch(interaction.user.id);
    await member.roles.add(role);

    // Save the updated rating in the JSON
    const users = loadUserData();
    users[discordUsername].rating = rating;
    saveUserData(discordUsername, users[discordUsername]);

    return rating;
  } catch (error) {
    console.error("Error fetching Codeforces data:", error);
    return null;
  }
};

// Slash command: /register
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === "register") {
    const cfProfileUrl = options.getString("url");
    const regex = /https:\/\/codeforces.com\/profile\/(.+)/;
    const match = cfProfileUrl.match(regex);
    if (!match) {
      return interaction.reply(
        "Invalid Codeforces profile URL. Please provide a valid one."
      );
    }

    const handle = match[1];
    const verificationCode = generateVerificationCode();

    // Ask the user to add verification code to their Codeforces bio
    await interaction.reply({
      content: `Please add the following code to your Codeforces Profile settings -> Social -> Organization or follow this [Link](https://codeforces.com/settings/social): \`\`\`${verificationCode}\`\`\` \n then use the \`/verify\` command to confirm.`,
      ephemeral: true,
    });
    // Save the verification code for later use
    const discordUsername = interaction.user.username;
    saveUserData(discordUsername, { handle, verificationCode });
  }

  // Slash command: /verify
  if (commandName === "verify") {
    const discordUsername = interaction.user.username;
    const users = loadUserData();

    if (!users[discordUsername] || !users[discordUsername].verificationCode) {
      return interaction.reply(
        "You haven't started the registration process. Use `/register` first."
      );
    }

    const { handle, verificationCode } = users[discordUsername];

    try {
      const response = await axios.get(`${CODEFORCES_API_USER}${handle}`);
      const userProfile = response.data.result[0];
      const bio = userProfile.organization || userProfile.firstName; // Adjust if needed

      if (bio && bio.includes(verificationCode)) {
        // Verification successful, fetch and save rating
        const rating = userProfile.rating || 0;
        users[discordUsername].rating = rating;

        // Save updated user data
        saveUserData(discordUsername, users[discordUsername]);

        // Assign role based on rating
        let role = interaction.guild.roles.cache.find(
          (r) => r.name === getCfRole(rating)
        );
        if (role) {
          await interaction.member.roles.add(role);
        }

        await interaction.reply(
          `Verification successful! Your handle ${handle} has been linked. Role assigned: ${getCfRole(
            rating
          )}`
        );
      } else {
        await interaction.reply(
          "Verification failed. Please ensure the code is in your profile bio."
        );
      }
    } catch (error) {
      console.error("Error fetching Codeforces profile:", error);
      await interaction.reply(
        "An error occurred while fetching your Codeforces profile. Please try again."
      );
    }
  }

  // Slash command: /update
  if (commandName === "update") {
    const discordUsername = interaction.user.username;
    const users = loadUserData();

    if (!users[discordUsername] || !users[discordUsername].handle) {
      return interaction.reply(
        "You have not registered yet. Use `/register` first."
      );
    }

    const handle = users[discordUsername].handle;
    const rating = await updateUserRole(interaction, discordUsername, handle);

    if (rating !== null) {
      await interaction.reply(
        `Your profile has been updated! Current rating: ${rating}`
      );
    } else {
      await interaction.reply("An error occurred while updating your profile.");
    }
  }

  // Slash command: /profile
  if (commandName === "profile") {
    let userdata = {};
    try {
      userdata = JSON.parse(fs.readFileSync("userData.json", "utf-8"));
    } catch (error) {
      console.error("Error loading userdata.json:", error);
    }
    const username = interaction.user.username; // Get the Discord username
    const userData = userdata[username]; // Fetch Codeforces data for the user

    if (!userData) {
      return interaction.reply({
        content: "You need to register first using `/register`.",
        ephemeral: true,
      });
    }

    try {
      const response = await axios.get(CODEFORCES_API_USER + userData.handle);
      const cfUser = response.data.result[0];

      const embed = new EmbedBuilder()
            .setTitle(`${cfUser.handle}'s Profile`)
            .setColor('#00aaff') // Customize your color
            .setThumbnail(cfUser.avatar || 'default_avatar_url.png') // Use user's avatar or a default image
            .addFields(
                { name: 'Rating', value: cfUser.rating ? cfUser.rating.toString() : 'Unrated', inline: true },
                { name: 'Max Rating', value: cfUser.maxRating ? cfUser.maxRating.toString() : 'Unrated', inline: true },
                { name: 'Friends', value: cfUser.friendOfCount.toString(), inline: true } // Adjust this field based on available data
            )
            .setTimestamp()
            .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Error fetching Codeforces data:", error);
      await interaction.reply({
        content:
          "An error occurred while fetching your profile. Please try again later.",
        ephemeral: true,
      });
    }
  }
});

// Register slash commands
const registerSlashCommand = async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: [
        {
          name: "register",
          description: "Register your Codeforces profile",
          options: [
            {
              name: "url",
              description: "Your Codeforces profile URL",
              type: 3, // STRING
              required: true,
            },
          ],
        },
        {
          name: "verify",
          description:
            "Verify your Codeforces profile by checking bio for verification code",
        },
        {
          name: "update",
          description: "Update your Codeforces rating and role manually",
        },
        {
          name: "profile",
          description: "View your Codeforces profile information",
        },
      ],
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
};

// Hosting bot via Express server
app.get("/", (req, res) => res.send("Bot is running."));
app.listen(process.env.PORT || 3000, () => console.log("Server is running."));

// Start bot
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
  registerSlashCommand();
  checkUpcomingContests();
});

// Login bot
client.login(process.env.TOKEN);
