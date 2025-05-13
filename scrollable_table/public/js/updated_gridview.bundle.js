import GridRow from './grid_row';
import Grid from './grid';

class Custom_GridRow extends GridRow {

	validate_columns_width() {
		let total_column_width = 0.0;

		this.selected_columns_for_grid.forEach((row) => {
			if (row.columns && row.columns > 0) {
				total_column_width += cint(row.columns);
			}
		});
	}

	make() {
		super.make();

		// Wait for DOM to render, then apply sticky classes
		setTimeout(() => {
			let $cols = this.row.find('.grid-static-col, .data-input, .grid-field');
			if ($cols.length >= 2) {
				$cols.eq(0).addClass("sticky-col-1");
				$cols.eq(1).addClass("sticky-col-2");
			}
		}, 0);
	}
}


class Custom_Grid extends Grid {

	make() {
		let template = `
			<div class="grid-field">
				<label class="control-label">${__(this.df.label || "")}</label>
				<span class="help"></span>
				<p class="text-muted small grid-description"></p>
				<div class="grid-custom-buttons"></div>
				<div class="form-grid-container" style="overflow-x: auto;">
					<div class="form-grid" style="min-width: 1000px;">
						<div class="grid-heading-row"></div>
						<div class="grid-body">
							<div class="rows"></div>
							<div class="grid-empty text-center">
								<img
									src="/assets/frappe/images/ui-states/grid-empty-state.svg"
									alt="Grid Empty State"
									class="grid-empty-illustration"
								>
								${__("No Data")}
							</div>
						</div>
					</div>
				</div>
				<div class="small form-clickable-section grid-footer">
					<div class="flex justify-between">
						<div class="grid-buttons">
							<button type="button" class="btn btn-xs btn-danger grid-remove-rows hidden"
								data-action="delete_rows">
								${__("Delete")}
							</button>
							<button type="button" class="btn btn-xs btn-danger grid-remove-all-rows hidden"
								data-action="delete_all_rows">
								${__("Delete All")}
							</button>
							<button type="button" class="btn btn-xs btn-secondary grid-add-row">
								${__("Add Row")}
							</button>
							<button type="button" class="grid-add-multiple-rows btn btn-xs btn-secondary hidden">
								${__("Add Multiple")}
							</button>
						</div>
						<div class="grid-pagination"></div>
						<div class="grid-bulk-actions text-right">
							<button type="button" class="grid-download btn btn-xs btn-secondary hidden">
								${__("Download")}
							</button>
							<button type="button" class="grid-upload btn btn-xs btn-secondary hidden">
								${__("Upload")}
							</button>
						</div>
					</div>
				</div>
			</div>
		`;

		this.wrapper = $(template).appendTo(this.parent);
		$(this.parent).addClass("form-group");
		this.set_grid_description();
		this.set_doc_url();

		frappe.utils.bind_actions_with_object(this.wrapper, this);

		this.form_grid = this.wrapper.find(".form-grid");
		this.form_grid_container = this.wrapper.find(".form-grid-container");

		this.setup_add_row();
		this.setup_grid_pagination();

		this.custom_buttons = {};
		this.grid_buttons = this.wrapper.find(".grid-buttons");
		this.grid_custom_buttons = this.wrapper.find(".grid-custom-buttons");
		this.remove_rows_button = this.grid_buttons.find(".grid-remove-rows");
		this.remove_all_rows_button = this.grid_buttons.find(".grid-remove-all-rows");

		this.setup_allow_bulk_edit();
		this.setup_check();

		if (this.df.on_setup) {
			this.df.on_setup(this);
		}
	}

	make_head() {
		if (this.prevent_build) return;

		if (this.header_row) {
			$(this.parent).find(".grid-heading-row .grid-row").remove();
		}

		this.header_row = new Custom_GridRow({
			parent: $(this.parent).find(".grid-heading-row"),
			parent_df: this.df,
			docfields: this.docfields,
			frm: this.frm,
			grid: this,
			configure_columns: true,
		});

		this.header_search = new Custom_GridRow({
			parent: $(this.parent).find(".grid-heading-row"),
			parent_df: this.df,
			docfields: this.docfields,
			frm: this.frm,
			grid: this,
			show_search: true,
		});

		this.header_search.row.addClass("filter-row");

		if (this.header_search.show_search || this.header_search.show_search_row()) {
			$(this.parent).find(".grid-heading-row").addClass("with-filter");
		} else {
			$(this.parent).find(".grid-heading-row").removeClass("with-filter");
		}

		this.filter_applied && this.update_search_columns();
	}

	render_result_rows($rows, append_row) {
		let result_length = this.grid_pagination.get_result_length();
		let page_index = this.grid_pagination.page_index;
		let page_length = this.grid_pagination.page_length;
		if (!this.grid_rows) return;

		for (var ri = (page_index - 1) * page_length; ri < result_length; ri++) {
			var d = this.data[ri];
			if (!d) return;

			if (d.idx === undefined) d.idx = ri + 1;
			if (d.name === undefined) d.name = "row " + d.idx;

			let grid_row;
			if (this.grid_rows[ri] && !append_row) {
				grid_row = this.grid_rows[ri];
				grid_row.doc = d;
				grid_row.refresh();
			} else {
				grid_row = new Custom_GridRow({
					parent: $rows,
					parent_df: this.df,
					docfields: this.docfields,
					doc: d,
					frm: this.frm,
					grid: this,
				});
				this.grid_rows[ri] = grid_row;
			}

			this.grid_rows_by_docname[d.name] = grid_row;
		}
	}

	setup_visible_columns() {
		if (this.visible_columns && this.visible_columns.length > 0) return;

		this.user_defined_columns = [];
		this.setup_user_defined_columns();
		let total_colsize = 1;

		const fields = this.user_defined_columns.length > 0
			? this.user_defined_columns
			: this.editable_fields || this.docfields;

		this.visible_columns = [];

		for (let _df of fields) {
			const df = this.user_defined_columns.length > 0
				? _df
				: this.fields_map[_df.fieldname];

			if (
				df && !df.hidden &&
				(this.editable_fields || df.in_list_view) &&
				((this.frm && this.frm.get_perm(df.permlevel, "read")) || !this.frm) &&
				!frappe.model.layout_fields.includes(df.fieldtype)
			) {
				df.colsize = df.columns || this.update_default_colsize(df);
				total_colsize += df.colsize;

				if (total_colsize > 100) return false;
				this.visible_columns.push([df, df.colsize]);
			}
		}

		let passes = 0;
		while (total_colsize < 11 && passes < 12) {
			for (let i in this.visible_columns) {
				let df = this.visible_columns[i][0];
				let colsize = this.visible_columns[i][1];
				if (colsize > 1 && colsize < 11 && frappe.model.is_non_std_field(df.fieldname)) {
					if (
						passes < 3 &&
						["Int", "Currency", "Float", "Check", "Percent"].includes(df.fieldtype)
					) continue;

					this.visible_columns[i][1] += 1;
					total_colsize++;
				}
				if (total_colsize > 10) break;
			}
			passes++;
		}

		this.setup_scrollable_width();
		this.verify_overflow_columns_width();
	}

	setup_scrollable_width() {
		let width = 200;
		this.visible_columns.forEach(column => {
			width += column[1] * 50 + 100;
		});
	}

	verify_overflow_columns_width() {
		let width = 200;
		this.visible_columns.forEach(column => {
			width += column[1] * 50 + 100;
		});
	}
}

frappe.ui.form.ControlTable = class CustomControlTable extends frappe.ui.form.ControlTable {
	make() {
		super.make();
		this.grid = new Custom_Grid({
			frm: this.frm,
			df: this.df,
			parent: this.wrapper,
			control: this,
		});
	}
}

// Inject custom CSS (optional if not in external stylesheet)
$(`<style>
	.sticky-col-1 {
		position: sticky;
		left: 0;
		background: #fff;
		z-index: 3;
		border-right: 1px solid #d1d1d1;
	}
	.sticky-col-2 {
		position: sticky;
		left: 120px; /* Adjust based on first column width */
		background: #fff;
		z-index: 3;
		border-right: 1px solid #d1d1d1;
	}
</style>`).appendTo("head");
