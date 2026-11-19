import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, DataTable, EmptyState, Modal, SelectField, Tabs, TextField, type Column } from '.';

describe('Button', () => {
  it('is a non-submitting button by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('maps variants to the app styles', () => {
    render(
      <>
        <Button variant="secondary">A</Button>
        <Button variant="danger-outline">B</Button>
      </>
    );
    expect(screen.getByRole('button', { name: 'A' })).toHaveClass('btn', 'secondary');
    expect(screen.getByRole('button', { name: 'B' })).toHaveClass('btn', 'danger-outline');
  });

  it('shows the busy label and blocks clicks while busy', async () => {
    const onClick = vi.fn();
    render(
      <Button busy busyLabel="Saving…" onClick={onClick}>
        Save
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TextField / SelectField', () => {
  it('links the label to the input', async () => {
    render(<TextField label="Username" />);
    const input = screen.getByLabelText('Username');
    await userEvent.type(input, 'dr.perera');
    expect(input).toHaveValue('dr.perera');
  });

  it('announces hints and errors', () => {
    render(<TextField label="Password" hint="At least 8 characters" error="Too short" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('At least 8 characters Too short');
    expect(screen.getByRole('alert')).toHaveTextContent('Too short');
  });

  it('renders select options', async () => {
    const onChange = vi.fn();
    render(
      <SelectField
        label="Role"
        defaultValue="staff"
        onChange={onChange}
        options={[
          { value: 'staff', label: 'Staff' },
          { value: 'admin', label: 'Administrator' },
        ]}
      />
    );
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'admin');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('Role')).toHaveValue('admin');
  });
});

type Row = { id: number; name: string };

describe('DataTable', () => {
  const rows: Row[] = [
    { id: 1, name: 'Kamala' },
    { id: 2, name: 'Sunil' },
  ];

  it('renders one row per item and handles row clicks', async () => {
    const onRowClick = vi.fn();
    const onTick = vi.fn();
    const columns: Column<Row>[] = [
      { key: 'name', header: 'Name', render: (r) => r.name },
      {
        key: 'tick',
        header: 'Tick',
        stopRowClick: true,
        render: (r) => <button onClick={() => onTick(r.id)}>Tick {r.name}</button>,
      },
    ];
    render(
      <DataTable
        caption="People"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />
    );

    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2

    await userEvent.click(screen.getByText('Sunil'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);

    // A click inside a stopRowClick cell must not open the row.
    onRowClick.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Tick Kamala' }));
    expect(onTick).toHaveBeenCalledWith(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Hidden">
        x
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is labelled by its title and closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Delete user?" onClose={onClose} actions={<Button>OK</Button>}>
        Are you sure?
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: 'Delete user?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Tabs', () => {
  it('marks the active tab and reports changes', async () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="Sections"
        active="visits"
        onChange={onChange}
        items={[
          { key: 'visits', label: 'Visits' },
          { key: 'images', label: 'Images' },
        ]}
      />
    );
    expect(screen.getByRole('tab', { name: 'Visits' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Images' }));
    expect(onChange).toHaveBeenCalledWith('images');
  });
});

describe('EmptyState', () => {
  it('offers the next step', async () => {
    const onAction = vi.fn();
    render(<EmptyState title="No patients yet" actionLabel="New patient" onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: 'New patient' }));
    expect(onAction).toHaveBeenCalled();
  });
});
