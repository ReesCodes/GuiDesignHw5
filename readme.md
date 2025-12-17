# Benjamin Tenney HW5: Scrabble

[GitRepo](https://github.com/ReesCodes/GuiDesignHw5)

[DeployMent]()


## Sources

[dictionary](https://gist.github.com/deostroll/7693b6f3d48b44a89ee5f57bf750bd32) Transposed to [words](js/words.json)


## Features

- Single-line board rendered for a single horizontal play area
- Seven-tile player rack drawn from a letter bag with correct frequency
- Letter bag implementation with remaining tile counts tracking
- Standard Scrabble letter values used for scoring
- Move input parsed from a single-line command (position + word)
- Contiguous placement enforcement (horizontal only)
- Word validation against the included dictionary
- Per-move score and cumulative game score reporting
- Rack refilling from the bag after each play
- Input validation and clear error messages for illegal moves
- End-of-game detection when no tiles remain or no legal plays
- Basic CLI help and commands (play, pass, quit)