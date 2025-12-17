// Simplified Scrabble-like one-line board with draggable tiles
$(function () {
	const boardJson = 'js/one_line_board.json';
	const piecesJson = 'js/pieces.json';
	let bag = [];
	let piecesData = null;
	let boardData = null;
	let wordList = null;
	let totalSubmittedScore = 0;

	function shuffle(a) {
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
	}

	function buildBag() {
		bag = [];
		piecesData.pieces.forEach(p => {
			for (let i = 0; i < p.amount; i++) {
				bag.push({ letter: p.letter, value: p.value });
			}
		});
		shuffle(bag);
	}

	function drawTiles(n) {
		const drawn = [];
		for (let i = 0; i < n && bag.length > 0; i++) drawn.push(bag.pop());
		return drawn;
	}

	function buildBoardUI() {
		const board = $('#board');
		board.empty();

		const bgInfo = boardData.board;
		const bg = $('<div id="board-bg"></div>').css({
			position: 'relative',
			width: bgInfo.width + 'px',
			height: bgInfo.height + 'px',
			backgroundImage: `url(${bgInfo.image})`,
			/* use explicit pixel sizing so the background image matches the JSON spec exactly */
			backgroundSize: `${bgInfo.width}px ${bgInfo.height}px`,
			backgroundRepeat: 'no-repeat',
			backgroundPosition: 'left top'
		});
		board.append(bg);

		const cells = boardData.cells.rows[0];
		cells.forEach(c => {
			const [x, y, w, h] = c.imageLocation;
			const cell = $(`<div class="board-cell" data-cell-number="${c.cell_number}" data-type="${c.type}"></div>`)
				.css({
					position: 'absolute',
					left: x + 'px',
					top: y + 'px',
					width: w + 'px',
					height: h + 'px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center'
				});

			// store cell info
			cell.data('cellInfo', c);

			// make droppable
			cell.droppable({
				accept: '.tile',
				hoverClass: 'cell-hover',
				drop: function (event, ui) {
					const tile = ui.draggable;
					placeTileInCell(tile, $(this));
				}
			});

			bg.append(cell);
		});
	}

	function createTileElement(letterObj) {
		const tile = $(`<div class="tile" data-letter="${letterObj.letter}" data-value="${letterObj.value}">
			<div class="letter">${letterObj.letter}</div>
			<div class="value">${letterObj.value}</div>
		</div>`);

		tile.draggable({
			revert: 'invalid',
			containment: 'document',
			zIndex: 1000,
			start: function () {
				$(this).css('cursor', 'grabbing');
			},
			stop: function (event, ui) {
				$(this).css('cursor', 'grab');
				// If this tile was placed and the user released it outside the board area,
				// treat that as returning the tile to the rack.
				try {
					const $el = $(this);
					// only consider tiles that are currently "placed"
					if (!$el.hasClass('placed')) return;
					if (!event || !event.originalEvent) return;
					const cx = event.originalEvent.clientX;
					const cy = event.originalEvent.clientY;
					// element at pointer
					const elAtPoint = document.elementFromPoint(cx, cy);
					if (!elAtPoint) return;
					const $hit = $(elAtPoint);
					// if dropped on the board or on a board cell or on the rack, do nothing here
					if ($hit.closest('#board').length || $hit.closest('.board-cell').length || $hit.closest('#rack').length) {
						return;
					}
					// otherwise return the tile to the rack
					const rack = $('#board-container #rack').first();
					if (rack.length) {
						returnTileToRack($el, rack);
					}
				} catch (e) {
					// fail silently if anything goes wrong
				}
			}
		});

		return tile;
	}

	function populateRack() {
		// choose the rack container that sits under the board (prefer child of #board-container)
		const rackContainer = $('#board-container #rack').first();
		rackContainer.find('.tile-container').remove();
		const tileHolder = $('<div class="tile-container"></div>').css({ display: 'flex', gap: '8px', paddingTop: '10px' });
		rackContainer.append(tileHolder);

		// draw up to 7 tiles (fill rack to 7)
		const existing = tileHolder.find('.tile').length;
		const toDraw = 7;
		const tiles = drawTiles(toDraw);

		tiles.forEach(t => {
			const el = createTileElement(t);
			tileHolder.append(el);
		});

		// make rack droppable so tiles can be returned
		rackContainer.droppable({
			accept: function(draggable) {
				// accept tiles that are placed but not locked
				return $(draggable).hasClass('placed') && !$(draggable).hasClass('locked');
			},
			hoverClass: 'rack-hover',
			drop: function (event, ui) {
				const tile = ui.draggable;
				returnTileToRack(tile, $(this));
			}
		});
	}

	function placeTileInCell(tile, cell) {
		// if occupied, reject
		if (cell.find('.tile').length > 0) {
			// animate back
			tile.animate({ top: 0, left: 0 });
			return;
		}

		// detach and append to cell, center it
		tile.appendTo(cell).css({ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' });
		tile.addClass('placed');
		// keep draggable enabled so user can drag placed tiles back to the rack

		updateScore();
		updatePreviewScore();
	}

	// Preview score considers placed but not locked tiles
	function updatePreviewScore() {
		const formed = getFormedWord();
		const preview = calculateWordScore(formed.cells);
		$('#preview-score').text(preview);
	}

	// Parse and apply a textual placement command like "7 HELLO" (0-based position or 1-based?)
	function applyPlacementCommand(cmd) {
		// simple format: <pos> <word>
		const parts = (''+cmd).trim().split(/\s+/);
		if (parts.length < 2) return { ok: false, msg: 'Invalid command format' };
		let pos = parseInt(parts[0], 10);
		if (isNaN(pos)) return { ok: false, msg: 'Invalid start position' };
		// assume 0-based positions in our JSON; if users enter 1-based, convert if needed
		// If pos seems 1-based (e.g. > columns-1), try converting
		if (pos > (boardData.columns - 1)) pos = pos - 1;
		const word = parts.slice(1).join('').toUpperCase();
		if (!word) return { ok: false, msg: 'No word provided' };

		// check contiguous fit
		if (pos < 0 || pos + word.length > boardData.columns) return { ok: false, msg: 'Word does not fit on board at that position' };

		// ensure target cells are empty (no locked tiles)
		const targetCells = [];
		for (let i = 0; i < word.length; i++) {
			const cellIdx = pos + i;
			const $cell = $(`#board .board-cell[data-cell-number='${cellIdx}']`);
			if (!$cell.length) return { ok: false, msg: `Cell ${cellIdx} not found` };
			if ($cell.find('.tile.locked').length) return { ok: false, msg: 'Target cells contain locked tiles' };
			targetCells.push($cell);
		}

		// check rack has required letters (account for duplicates)
		const rackTiles = {};
		$('#board-container #rack .tile').each(function () {
			const L = $(this).attr('data-letter') || '';
			rackTiles[L] = (rackTiles[L] || 0) + 1;
		});

		for (let i = 0; i < word.length; i++) {
			const ch = word[i];
			if (!rackTiles[ch] || rackTiles[ch] <= 0) return { ok: false, msg: 'Rack does not contain required tiles' };
			rackTiles[ch]--;
		}

		// place tiles from rack into target cells
		for (let i = 0; i < word.length; i++) {
			const ch = word[i];
			// take first matching tile from rack
			const $tile = $('#board-container #rack .tile').filter(function () { return $(this).attr('data-letter') === ch && !$(this).hasClass('locked'); }).first();
			if (!$tile.length) return { ok: false, msg: 'Unexpected missing tile during placement' };
			placeTileInCell($tile, targetCells[i]);
		}

		return { ok: true, msg: 'Placed' };
	}

	// Fill rack up to 7 tiles
	function refillRack() {
		const tileHolder = $('#board-container #rack .tile-container').first();
		if (!tileHolder.length) return;
		while (tileHolder.find('.tile').length < 7 && bag.length > 0) {
			const next = bag.pop();
			const el = createTileElement(next);
			tileHolder.append(el);
		}
	}

	// Place command button handler
	$(document).on('click', '#place-command-button', function () {
		$('#message').text('');
		const cmd = $('#move-input').val() || '';
		const res = applyPlacementCommand(cmd);
		if (!res.ok) {
			$('#message').text(res.msg);
			return;
		}
		// success: show preview score then allow user to submit which will lock and add score
		updatePreviewScore();
		// auto-refill rack after placement so user sees new tiles; DO NOT auto-lock or submit
		refillRack();
	});

	function returnTileToRack(tile, rack) {
		// enable dragging again and remove placed class
		tile.removeClass('placed');
		tile.draggable('enable');
		// move to rack's tile-container
		const container = rack.find('.tile-container').first();
		if (container.length === 0) {
			const newContainer = $('<div class="tile-container"></div>').css({ display: 'flex', gap: '8px', paddingTop: '10px' });
			rack.append(newContainer);
			newContainer.append(tile.css({ position: 'relative', left: '', top: '', transform: '' }));
		} else {
			container.append(tile.css({ position: 'relative', left: '', top: '', transform: '' }));
		}

		updateScore();
	}

	function updateScore() {
		let score = 0;
		let wordMultiplier = 1;

		// cell type multipliers are defined in the board JSON under `cell_types`.
		// fall back to 1x multipliers if boardData or the mapping is missing.
		const typeMap = (boardData && boardData.cell_types) ? boardData.cell_types : {};

		$('#board .board-cell').each(function () {
			const cell = $(this);
			const tile = cell.find('.tile');
			if (tile.length === 0) return;
			const val = parseInt(tile.attr('data-value')) || 0;
			const type = cell.data('type') || 'empty';

			const info = typeMap[type] || { tileScoreMultiplier: 1, wordScoreMultiplier: 1 };
			const tileMul = info.tileScoreMultiplier || 1;
			const wordMul = info.wordScoreMultiplier || 1;

			// apply tile multiplier immediately
			score += val * tileMul;

			// accumulate word multipliers to be applied to the whole word
			wordMultiplier *= wordMul;
		});

		score = score * wordMultiplier;
		$('#score').text(`Current score: ${score}`);
	}

	function resetGame() {
		buildBag();
		populateRack();
		// clear board cells
		$('#board .board-cell .tile').each(function () {
			$(this).remove();
		});
		updateScore();
	}

	// load jsons and initialize
	$.when($.getJSON(piecesJson), $.getJSON(boardJson), $.getJSON('js/words.json')).done(function (piecesResp, boardResp, wordsResp) {
		piecesData = piecesResp[0];
		boardData = boardResp[0];
		wordList = wordsResp[0];
		// normalize word list to a fast lookup set (uppercase)
		const wordSet = new Set((wordList || []).map(w => (''+w).toUpperCase()));

		buildBag();
		buildBoardUI();
		populateRack();

		// reset handler
		$('#reset-button').on('click', function () {
			resetGame();
		});

		// submit word handler
		$('#submit-word-button').on('click', function () {
			const formed = getFormedWord();
			if (!formed.word) {
				alert('No tiles placed to submit.');
				return;
			}

			const candidate = formed.word.toUpperCase();
			if (wordSet.has(candidate)) {
				// valid word: lock tiles and record score
				lockTiles(formed.cells);
				const wordScore = calculateWordScore(formed.cells);
				totalSubmittedScore += wordScore;
				$('#submitted-list').append(`<li>${candidate} — ${wordScore} pts</li>`);
				$('#score').text(`Current score: ${totalSubmittedScore}`);
			} else {
				alert(`${candidate} is not a valid word.`);
			}
		});
	}).fail(function (err) {
		console.error('Failed to load data JSON:', err);
	});


	// Helper: read placed tiles left-to-right to form the word
	function getFormedWord() {
		const cells = $('#board .board-cell').toArray();
		// sort by left position
		cells.sort((a, b) => $(a).position().left - $(b).position().left);
		let word = '';
		const cellsWithTiles = [];
		cells.forEach(c => {
			const $c = $(c);
			const tile = $c.find('.tile');
			if (tile.length) {
				word += (tile.attr('data-letter') || '').toUpperCase();
				cellsWithTiles.push($c);
			}
		});
		return { word: word, cells: cellsWithTiles };
	}

	// Helper: lock tiles so they cannot be returned (by removing 'placed' and disabling draggable and adding locked flag)
	function lockTiles(cells) {
		cells.forEach($c => {
			const t = $c.find('.tile');
			if (t.length) {
				t.addClass('locked');
				// disable dragging to prevent accidental moves
				t.draggable('disable');
			}
		});
	}

	// Helper: calculate score for the provided cell elements (uses same multipliers as updateScore)
	function calculateWordScore(cells) {
		let score = 0;
		let wordMultiplier = 1;
		const typeMap = (boardData && boardData.cell_types) ? boardData.cell_types : {};
		cells.forEach($c => {
			const tile = $c.find('.tile');
			if (!tile.length) return;
			const val = parseInt(tile.attr('data-value')) || 0;
			const type = $c.data('type') || 'empty';
			const info = typeMap[type] || { tileScoreMultiplier: 1, wordScoreMultiplier: 1 };
			score += val * (info.tileScoreMultiplier || 1);
			wordMultiplier *= (info.wordScoreMultiplier || 1);
		});
		return score * wordMultiplier;
	}
});
